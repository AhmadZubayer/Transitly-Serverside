const admin = require('./firebaseAdmin');
const { usersColl } = require('../config/database');

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  try {
    const idToken = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
};

const verifyAdmin = async (req, res, next) => {
  try {
    const email = req.decoded_email;
    const user = await usersColl.findOne({ email }, { projection: { role: 1 } });
    if (!user || user.role !== 'admin') {
      return res.status(403).send({ message: 'forbidden access' });
    }
    next();
  } catch (e) {
    return res.status(500).send({ message: 'server error' });
  }
};

const verifyVendor = async (req, res, next) => {
  try {
    const email = req.decoded_email;
    const user = await usersColl.findOne({ email }, { projection: { role: 1 } });
    if (!user || user.role !== 'vendor') {
      return res.status(403).send({ message: 'forbidden access' });
    }
    next();
  } catch (e) {
    return res.status(500).send({ message: 'server error' });
  }
};

module.exports = { verifyFBToken, verifyAdmin, verifyVendor };