
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

export { pullS3, syncS3 };