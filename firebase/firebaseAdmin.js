const path = require('path');
const admin = require('firebase-admin');

// Keep service account JSON in serverside root as: transitly-firebase-adminsdk.json
const serviceAccountPath = path.join(__dirname, '..', 'transitly-firebase-adminsdk.json');
// eslint-disable-next-line import/no-dynamic-require, global-require
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;