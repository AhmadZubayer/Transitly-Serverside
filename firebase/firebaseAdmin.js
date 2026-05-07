const path = require('path');
const admin = require('firebase-admin');

// Keep service account JSON in serverside root as: transitly-firebase-adminsdk.json
// const serviceAccountPath = path.join(__dirname, '..', 'transitly-firebase-adminsdk.json');
// // eslint-disable-next-line import/no-dynamic-require, global-require
// const serviceAccount = require(serviceAccountPath);

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;