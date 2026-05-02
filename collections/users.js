const { ObjectId } = require('mongodb');
const { usersColl } = require('../config/database');

function usersAPI(app) {

	// POST - Create New User
	app.post('/users', async (req, res) => {
		try {
			const userData = req.body;
			userData.role = 'user';
			const result = await usersColl.insertOne(userData);
			res.send(result);
			console.log("DB POST: User created -", userData.email);
			console.log(result);
		} catch (error) {
			console.error("Database error:", error);
			res.status(500).send({ error: "Failed to save user" });
		}
	});

	// GET - Get all users (optional)
	app.get('/users', async (req, res) => {
		try {
			const users = await usersColl.find({}).toArray();
			res.send(users);
		} catch (error) {
			console.error("Database error, Unable to fetch users list:", error);
			res.status(500).send({ error: "Failed to fetch users" });
		}
	});

	// GET - Get user by email
	app.get('/users/:email', async (req, res) => {
		try {
			const { email } = req.params;
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

	// GET - Get user role by email
	app.get('/users/:email/role', async (req, res) => {
		try {
			const { email } = req.params;
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
}

module.exports = usersAPI;
