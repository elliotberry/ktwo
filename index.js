#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

import kdbxweb from 'kdbxweb';

import ConfigStore from 'configstore';
import AWS from 'aws-sdk';
import yargs from 'yargs/yargs';
import {hideBin} from 'yargs/helpers';
import {pullS3, syncS3} from './s3.js';
import {mergeDb, listEntry, askPassword, getRandomPass} from './db-tools.js';
import {hash} from '@node-rs/argon2';


kdbxweb.CryptoEngine.setArgon2Impl((password, salt,
  memory, iterations, length, parallelism, type) => {
  hash(password, {
      type:type,
      salt: salt,
      memoryCost: 19456,
      timeCost: 2,
      outputLen: 32,
      parallelism: 1
  }).then((hash) => {
  return Promise.resolve(hash);
  });
});


async function listEntries(dbname, options) {
  try {
    const password = await askPassword();
    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password.password));
    const dbpath = path.join(process.env.HOME, '.config', 'configstore', `${dbname}.kdbx`);
    const data = new Uint8Array(await fs.readFile(dbpath));
    const db = await kdbxweb.Kdbx.load(data.buffer, credentials);

    db.groups[0].forEach(group => {
      if (!options.group || options.group === group.name) {
        console.log(chalk.yellow.bold(group.name));
        group.entries.forEach(entry => {
          if ((!options.title || options.title === entry.fields.Title) && (!options.group || options.group === entry.parentGroup.name)) {
            console.log(listEntry(entry, 'lightblue'));
          }
        });
      }
    });
  } catch (err) {
    console.error(chalk.red(err));
  }
}

async function pullDatabase(s3path) {
  try {
    console.log(chalk.yellow(`Pulling DB file and config from ${s3path}`));
    const [dbData, configData] = await pullS3(s3path);
    const dbname = s3path.split('/').pop();
    const dbPath = path.join(process.env.HOME, '.config', 'configstore', `${dbname}.kdbx`);
    const configPath = path.join(process.env.HOME, '.config', 'configstore', `k2${dbname}.json`);

    if ((await fs.access(dbPath).catch(() => false)) || (await fs.access(configPath).catch(() => false))) {
      console.log(chalk.yellow('DB already exists, use the sync command instead - k2 sync <dbname>'));
      return;
    }

    console.log(chalk.yellow('Writing DB and config to disk...'));
    await fs.writeFile(dbPath, dbData.Body);
    await fs.writeFile(configPath, configData.Body);
    console.log(chalk.green('Files written!'));
  } catch (err) {
    console.error(chalk.red(err));
  }
}

async function syncDatabase(dbname, bucket) {
  try {
    if (bucket) {
      console.log(chalk.yellow('-s|--bucket option is not implemented'));
    }
    const dbpath = path.join(process.env.HOME, '.config', 'configstore', `${dbname}.kdbx`);
    const config = new ConfigStore(`${name}-${dbname}`);
    const data = new Uint8Array(await fs.readFile(dbpath));
    const password = await askPassword('Enter the database password:');
    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password.password));
    const dbLocalUnlocked = await kdbxweb.Kdbx.load(data.buffer, credentials);

    console.log(chalk.yellow('Opening local db...'));
    const s3path = `${config.get('syncBucket')}/${name}/${dbname.split('.')[0]}`;
    const [dbRemoteRes, configRemoteRes] = await pullS3(s3path);
    const dbRemoteData = new Uint8Array(dbRemoteRes.Body).buffer;
    const dbRemoteUnlocked = await kdbxweb.Kdbx.load(dbRemoteData, credentials);
    const mergedDb = await mergeDb(dbLocalUnlocked, dbRemoteUnlocked);

    console.log(chalk.yellow('Saving DB...'));
    const dbBuffer = await mergedDb.save();
    await fs.writeFile(dbpath, Buffer.from(dbBuffer));
    await syncS3(dbBuffer, config);
    console.log(chalk.green('DB synced successfully!'));
  } catch (err) {
    console.error(chalk.red(err));
  }
}

async function addEntry(dbname, options) {
  try {
    const dbpath = path.join(process.env.HOME, '.config', 'configstore', `${dbname}.kdbx`);
    const password = await askPassword('Enter the database password:');
    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password.password));
    const data = new Uint8Array(await fs.readFile(dbpath));
    const db = await kdbxweb.Kdbx.load(data.buffer, credentials);

    console.log(chalk.green('Successfully opened DB!'));

    let passwordValue;
    if (options.askpass) {
      const userPass = await askPassword('Enter a password for the entry:');
      passwordValue = userPass.password;
    } else {
      passwordValue = getRandomPass();
    }
    const protectedPassword = kdbxweb.ProtectedValue.fromString(passwordValue);

    let group = db.getDefaultGroup();
    if (options.group && options.group !== 'default') {
      group = db.groups.find(g => g.name === options.group) || db.createGroup(group, options.group);
    }

    const entry = db.createEntry(group);
    entry.fields.Title = options.title;
    entry.fields.UserName = options.user;
    entry.fields.URL = options.url;
    entry.fields.Password = protectedPassword;
    entry.fields.Notes = options.note;

    console.log(chalk.yellow('Entry added...'));
    console.log(listEntry(entry, 'lightblue'));

    console.log(chalk.yellow('Saving DB...'));
    const dbBuffer = await db.save();
    await fs.writeFile(dbpath, Buffer.from(dbBuffer));
    console.log(chalk.green('DB saved!'));

    // Sync if configured
    const config = new ConfigStore(`${name}-${dbname}`);
    await syncS3(dbBuffer, config);
  } catch (err) {
    console.error(chalk.red(err));
  }
}

async function createDatabase(dbname, {bucket}) {
  try {
    const dbpath = path.resolve(`${process.env.HOME}/.config/configstore/${dbname}.kdbx`);
    console.log(dbpath);

    const config = new ConfigStore(`${name}-${dbname}`, {
      name: dbname,
      syncBucket: bucket,
    });
    console.log(chalk.yellow(`Config file: ${config.path}`));
    console.log(chalk.yellow('Initializing DB'));

    const password = await askPassword();
    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password.password));
    const newDb = kdbxweb.Kdbx.create(credentials, dbname);
    await newDb.upgrade();
    const dbBuffer = await newDb.save();
    await fs.writeFile(dbpath, Buffer.from(dbBuffer));

    console.log(chalk.green(`${dbpath} created successfully!`));
  } catch (err) {
    console.error(chalk.red(err));
  }
}


