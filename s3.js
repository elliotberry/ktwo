
import fs from 'node:fs';


import AWS from 'aws-sdk';
const s3 = new AWS.S3();

// TODO: Consider implementing storage provider objects under a common interface to facilitate more sync storage options.
// it's possible that the simplest implementation of this idea would be to just implement each provider as a function
// that returns a promise.

/**
 * Pulls a database and its respective configuration file from the given s3 url.
 * @param {string} s3url - the S3 URL to the db key in S3 e.g. s3://mybucket/k2/mydb
 * @return {Promise}
 */
function pullS3(s3url) {
  let parts = s3url.split('/'),
      bucket = parts[2],
      keyBase = parts.slice(3).reduce((acc, val) => `${acc}/${val}`);
  let dbKey = `${keyBase}/${parts[4]}.kdbx`,
      configKey = `${keyBase}/${parts[4]}.json`;
  let dbPullParams = {
    Bucket: bucket,
    Key: dbKey 
  };
  let dbPromise = s3.getObject(dbPullParams).promise();

  let configPullParams = {
    Bucket: bucket,
    Key: configKey
  };
  let configPromise = s3.getObject(configPullParams).promise();

  return Promise.all([dbPromise, configPromise]);
}

function syncS3(db, config) {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
  let dbUploadParams = {
    Body: Buffer.from(db),
    Bucket: config.get('syncBucket').split('/').pop(),
    Key: `k2/${config.get('name').split('.')[0]}/${config.get('name')}.kdbx`,
    //ServerSideEncryption: 'AES256'
    Tagging: "application=k2&type=kdbx4"
  };

  let configUploadParams = {
    Body: fs.readFileSync(config.path),
    Bucket: config.get('syncBucket').split('/').pop(),
    Key: `k2/${config.get('name').split('.')[0]}/${config.get('name')}.json`,
    Tagging: "application=k2&type=k2config"
  };

  let dbUploadPromise = s3.putObject(dbUploadParams).promise();
  let configUploadPromise = s3.putObject(configUploadParams).promise();

  return Promise.all([dbUploadPromise, configUploadPromise]);
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
/*
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
*/

export { pullS3, syncS3 };