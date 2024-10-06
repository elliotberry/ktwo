import chalk from 'chalk';

import kdbxweb from 'kdbxweb';

/**
 * Handle merging a local and remote version of a database
 * @param {ArrayBuffer} data - database file contents
 * @param {ArrayBuffer} remoteData - remote database file contents
 * @param {KdbxCredentials} credentials - credentials for both databases
 */
function mergeDb(db, remoteDb) {
  let editStateBeforeSave = db.getLocalEditState(); // save local editing state (serializable to JSON)
  db.setLocalEditState(editStateBeforeSave); // assign edit state obtained before save
  // work with db
  db.merge(remoteDb); // merge remote into local
 // delete remoteDb; // don't use remoteDb anymore
  return db;
  //let saved = await db.save(); // save local db
  //editStateBeforeSave = db.getLocalEditState(); // save local editing state again
  //let pushedOk = pushToUpstream(saved); // push db to upstream
  //if (pushedOk) {
  //    db.removeLocalEditState(); // clear local editing state
  //    editStateBeforeSave = null; // and discard it
  //}
}

/**
 * Get the value of a field in an entry, returns the plain text value of kdbx.ProtectedValue
 * @param {KdbxEntry} entry - the entry to retrieve a field value
 * @param {string} fieldName - the name of the entry field to retreive
 * @return {string} - the value in a field or ''
 */
function entryField(entry, fieldName) {
  const value = entry.fields[fieldName];
  const isProtected = value instanceof kdbxweb.ProtectedValue;
  return (value && isProtected && value.getText()) || value || '';
}

function listEntry(entry, color) {
  let password = entry.fields.Password;
  return chalk.keyword(color)(`  Title:    ${entryField(entry, 'Title')}\n` + `  UserName: ${entryField(entry, 'UserName')}\n` + `  Password: ${entryField(entry, 'Password')}\n` + `  URL:      ${entryField(entry, 'URL')}\n` + `  Notes:    ${entryField(entry, 'Notes')}\n`);
}

function ask(prompt, type) {
  const questions = [
    {
      name: 'response',
      type: type,
      message: prompt,
      validate: value => {
        if (value.length) {
          return true;
        } else {
          return prompt;
        }
      },
    },
  ];
  return inquirer.prompt(questions);
}

export {mergeDb, listEntry, ask};
