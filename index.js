require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;


// middlewares

app.use(cors());
app.use(express.json());




const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7x5x4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;



// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        // Collections:
        const userCollection = client.db("studyDB").collection('users');
        const sessionCollection = client.db("studyDB").collection('sessions');
        const reviewCollection = client.db("studyDB").collection('reviews');
        const bookedSessionCollection = client.db("studyDB").collection('bookedSession');
        const notesCollection = client.db("studyDB").collection('notes');
        const materialCollection = client.db("studyDB").collection('materials');
        const paymentCollection = client.db("studyDB").collection('payments');


        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token });
        })

        // middlewares

        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: "Unauthorized Access" });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: "Unauthorized Access" });
                }
                req.decoded = decoded;
                next();
            })
        }

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: "Forbidden Access" });
            }
            next();
        }


        // user related apis

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: "User Already Exists", insertedId: null });
            };

            const result = await userCollection.insertOne(user);
            res.send(result);
        });


        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const cursor = userCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        });

        app.get('/users/role/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email });
            if (!user) {
                return res.send({ role: 'student' })
            }

            res.send({ role: user.role });

        })

        app.get('/users/tutors', async (req, res) => {
            const query = { role: 'tutor' };
            const cursor = userCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.patch('/user/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: data.role
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });


        // search

        app.get('/all-users', verifyToken, verifyAdmin, async (req, res) => {
            const search = req.query.search;
            let query = {
                name: {
                    $regex: search,
                    $options: 'i'
                }
            }
            const result = await userCollection.find(query).toArray();
            res.send(result);
        })



        // session related apis:

        app.post('/sessions', verifyToken, async (req, res) => {
            const session = req.body;
            const result = await sessionCollection.insertOne(session);
            res.send(result);
        })

        app.get('/approved-sessions', async (req, res) => {
            const query = { status: 'approved' };
            const cursor = sessionCollection.find(query).limit(6);
            const result = await cursor.toArray();
            res.send(result);
        })


        app.get('/sessions', async (req, res) => {
            const cursor = sessionCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/session/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await sessionCollection.findOne(query);
            res.send(result);
        });

        app.get('/sessions/:email', async (req, res) => {
            const email = req.params.email;
            const query = { tutorEmail: email };
            const cursor = sessionCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });


        app.patch('/session/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedSession = {
                $set: {
                    status: 'pending',
                    rejectionReason: null,
                    feedback: null,
                }
            }
            const result = await sessionCollection.updateOne(filter, updatedSession);
            res.send(result);
        });

        app.patch('/approve-session/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const session = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedSession = {
                $set: {
                    status: 'approved',
                    registrationFee: session.registrationFee,
                    rejectionReason: null,
                    feedback: null,
                }
            }
            const result = await sessionCollection.updateOne(filter, updatedSession);
            res.send(result);
        });

        app.patch('/reject-session/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const session = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedSession = {
                $set: {
                    status: 'rejected',
                    rejectionReason: session.rejectionReason,
                    feedback: session.feedback
                }
            }
            const result = await sessionCollection.updateOne(filter, updatedSession);
            res.send(result);
        })

        app.get('/approved-sessions/:email', async (req, res) => {
            const email = req.params.email;
            const query = { tutorEmail: email, status: 'approved' };
            const cursor = sessionCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });


        app.delete('/session/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await sessionCollection.deleteOne(query);
            res.send(result);
        })

        app.patch('/update-session/:id', async (req, res) => {
            const session = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedSession = {
                $set: {
                    ...session
                }
            }
            const result = await sessionCollection.updateOne(filter, updatedSession);
            res.send(result);
        })

        // Review Related APIs

        app.post('/reviews', async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        });

        app.get('/reviews', async (req, res) => {
            const cursor = reviewCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/reviews/:sessionId', async (req, res) => {
            const sessionId = req.params.sessionId;
            const query = { sessionId: sessionId };
            const cursor = reviewCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });


        // booking related APIs

        app.post('/bookedSessions', async (req, res) => {
            const session = req.body;
            const result = await bookedSessionCollection.insertOne(session);
            res.send(result);
        })

        app.get('/bookedSessions', async (req, res) => {
            const cursor = bookedSessionCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/bookedSessions/:email', async (req, res) => {
            const email = req.params.email;
            const query = { studentEmail: email };
            const result = await bookedSessionCollection.find(query).toArray();
            res.send(result);
        });


        // Notes related APIs

        app.post('/notes', async (req, res) => {
            const note = req.body;
            const result = await notesCollection.insertOne(note);
            res.send(result);
        })

        app.get('/notes', async (req, res) => {
            const cursor = notesCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/notes/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const cursor = notesCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/note/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await notesCollection.findOne(query);
            res.send(result);
        });

        app.patch('/note/:id', async (req, res) => {
            const note = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedNote = {
                $set: {
                    title: note.title,
                    description: note.description
                }
            }
            const result = await notesCollection.updateOne(filter, updatedNote);
            res.send(result);
        });


        app.delete('/note/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await notesCollection.deleteOne(query);
            res.send(result);
        });


        // study materials related APIs

        app.post('/materials', async (req, res) => {
            const material = req.body;
            const result = await materialCollection.insertOne(material);
            res.send(result);
        });

        app.get('/materials', async (req, res) => {
            const cursor = materialCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        });

        app.get('/materials/:email', async (req, res) => {
            const email = req.params.email;
            const query = { tutorEmail: email };
            const cursor = materialCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.patch('/material/:id', async (req, res) => {
            const material = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedMaterial = {
                $set: {
                    link: material.link
                }
            };

            if (material.image) {
                updatedMaterial.$set.image = material.image;
            }

            const result = await materialCollection.updateOne(filter, updatedMaterial);
            res.send(result);
        });


        app.delete('/material/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await materialCollection.deleteOne(query);
            res.send(result);
        });

        app.get('/studyMaterials', async (req, res) => {
            const sessionIds = req.query.sessionIds.split(',');
            const materials = await materialCollection.find({
                sessionId: {
                    $in: sessionIds
                }
            })
                .toArray();
            res.send(materials);
        });



        // Payment Intent

        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        });

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);
            res.send(paymentResult);
        })


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('The Master Is Teaching!');
})

app.listen(port, () => {
    console.log(`The Server Is Running On Port ${port}`)
})