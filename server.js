const express = require("express")
const promClient = require("prom-client");
const connectDB = require("./assets/db");
const Liked = require("./Models/liked_tweetsModel");
const app = express()
require("dotenv").config()
app.use(express.json())
// Create database connection
connectDB()

// Prometheus
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 })

const likesCounter = new promClient.Counter({
    name: "node_request_twitter_likes_total",
    help: "The total number of requests from the command \"/likes\" "
})




app.get("/likes/:id", async (req, res) => {
    const userId = req.params.id
    
    Liked.countDocuments({ user_id: userId }, (err, count) => {
        if (err) {
            console.log(err)
        }
        else {

            // Increase Prometheus counter
            likesCounter.inc()
            res.json({ likes: count })
        }
    }) 
})


app.get("/metrics", async (req, res) => {
    res.set("Content-Type", promClient.register.contentType)
    res.end(await promClient.register.metrics())
})



app.listen(5000, "localhost", () => console.log("Express server running on port 5000"))