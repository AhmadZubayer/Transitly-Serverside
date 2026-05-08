const { ObjectId } = require('mongodb');
const { usersColl } = require('../config/database');
const { verifyFBToken, verifyAdmin } = require('../firebase/firebaseVerify');

function usersAPI(app) {

	app.post('/users', async (req, res) => {
		try {
			const userData = req.body;
			const query = { email: userData.email };

			const existingUser = await usersColl.findOne(query);
			
			if (existingUser) {
				const updateDoc = {
					$set: {
						displayName: userData.displayName || existingUser.displayName,
						photoURL: userData.photoURL || existingUser.photoURL,
						phone: userData.phone || existingUser.phone || '',
						updatedAt: new Date()
					}
				};
				const result = await usersColl.updateOne(query, updateDoc);
				res.send(result);
				console.log("DB POST: User updated -", userData.email);
			} else {
				userData.role = 'user';
				userData.createdAt = new Date();
				const result = await usersColl.insertOne(userData);
				res.send(result);
				console.log("DB POST: User created -", userData.email);
			}
		} catch (error) {
			console.error("Database error:", error);
			res.status(500).send({ error: "Failed to save user" });
		}
	});

	app.get('/users', verifyFBToken, verifyAdmin, async (req, res) => {
		try {
			const users = await usersColl.find({}).toArray();
			res.send(users);
		} catch (error) {
			console.error("Database error, Unable to fetch users list:", error);
			res.status(500).send({ error: "Failed to fetch users" });
		}
	});

	app.get('/users/:email', verifyFBToken, async (req, res) => {
		try {
			const { email } = req.params;
			if (email !== req.decoded_email) {
				return res.status(403).send({ message: 'forbidden access' });
			}
			const user = await usersColl.findOne({ email });
			if (!user) {
				return res.status(404).send({ error: "User not found" });
			}
			res.send(user);
		} catch (error) {
			console.error("Database error:", error);
			res.status(500).send({ error: "Failed to fetch user" });
		}
	});

	app.get('/users/:email/role', verifyFBToken, async (req, res) => {
		try {
			const { email } = req.params;
			
			if (email !== req.decoded_email) {
				const requester = await usersColl.findOne({ email: req.decoded_email }, { projection: { role: 1 } });
				if (!requester || requester.role !== 'admin') {
					return res.status(403).send({ message: 'forbidden access' });
				}
			}
			const user = await usersColl.findOne({ email }, { projection: { role: 1 } });
			if (!user) {
				return res.status(404).send({ error: "User not found" });
			}
			res.send({ role: user.role || 'user' });
		} catch (error) {
			console.error("Database error:", error);
			res.status(500).send({ error: "Failed to fetch user role" });
		}
	});

	app.patch('/users/:id/role', verifyFBToken, verifyAdmin, async (req, res) => {
		try {
			const { id } = req.params;
			const { role } = req.body;

			const allowedRoles = ['user', 'vendor', 'admin', 'fraud'];
			if (!allowedRoles.includes(role)) {
				return res.status(400).send({ error: 'Invalid role supplied' });
			}

			const filter = { _id: new ObjectId(id) };
			const updateDoc = {
				$set: { role }
			};

			const result = await usersColl.updateOne(filter, updateDoc);
			if (!result.matchedCount) {
				return res.status(404).send({ error: 'User not found' });
			}

			res.send(result);
		} catch (error) {
			console.error('Database error, Unable to update user role:', error);
			res.status(500).send({ error: 'Failed to update user role' });
		}
	});
}

module.exports = usersAPI;
