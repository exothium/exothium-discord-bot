require("dotenv").config()
const express = require("express")
const promClient = require("prom-client");
const connectDB = require("./assets/db");
const Liked = require("./Models/liked_tweetsModel");
const Retweets = require("./Models/retweetModel");
const Tweets = require("./Models/tweetModel")
const app = express()
const { TwitterApi } = require('twitter-api-v2');
const { TwitterApiRateLimitPlugin } = require('@twitter-api-v2/plugin-rate-limit') 

// Constant variables
const twitter_account_id = process.env.TWITTER_ACCOUNT_ID
const twitter_bearer_token = process.env.TWITTER_BEARER_TOKEN

// Twitter API
const rateLimitPlugin = new TwitterApiRateLimitPlugin()
const appOnlyClient = new TwitterApi(twitter_bearer_token, { plugins: [rateLimitPlugin]});
const client = appOnlyClient.v2;


// Express conf
app.use(express.json())

// Create database connection
connectDB()

// Prometheus
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 })

const likesCounter = new promClient.Counter({
    name: "node_request_twitter_likes_total",
    help: "The total number of requests from the \"/likes\" command"
})

const retweetsCounter = new promClient.Counter({
    name: "node_request_twitter_retweets_total",
    help: "The total number of requests from the \"/retweets\" command"
})

const getTweetsCounter = new promClient.Counter({
    name: "node_request_twitter_getTweets_total",
    help: "The total number of requests from the \"!getTweets\" command"
})

const getLikesCounter = new promClient.Counter({
    name: "node_request_twitter_getLikes_total",
    help: "The total number of requests from the \"!getLikes\" command"
})

const getRetweetsCounter = new promClient.Counter({
    name: "node_request_twitter_getRetweets_total",
    help: "The total number of requests from the \"!getRetweets\" command"
})


app.get("/likes/:username", async (req, res) => {
    // Increase Prometheus counter
    likesCounter.inc()

    const { username } = req.params
    const user = await client.userByUsername(username).then((user) => { return user.data })

    if (!user) {
        res.json({ message: "User does not exist "})
        return
    }
    
    Liked.countDocuments({ user_id: user.id }, (err, count) => {
        if (err) {
            console.log(err)
        }
        else {
            res.json({ message: `User @${username} liked ${count} tweets.` })
        }
    })
})

app.get("/retweets/:username", async (req, res) => {
    // Increase Prometheus counter
    retweetsCounter.inc()

    const { username } = req.params

    const user = await client.userByUsername(username).then((user) => { return user.data })

    if (!user) {
        res.json({ message: "User does not exist "})
        return
    }
    Retweets.countDocuments({ user_id: user.id }, (err, count) => {
        if (err) {
            console.log(err)
        }
        else {
            res.json({ message: `User @${username} retweeted ${count} tweets.` })
        }
    })

})

app.post("/tweets", async (req, res) => {
    // Increase Prometheus counter
    getTweetsCounter.inc()

    try {
        const userTimeline = await client.userTimeline(twitter_account_id, { "max_results": 100, "tweet.fields": "public_metrics" })
        // Get the user timeline until there are no more results available 
        // or until rate limit is hit
        let tweets = []
        for await (const tweet of userTimeline) {
            tweets.push({
                "tweet_id": tweet.id,
                "retweet_count": tweet.public_metrics.retweet_count,
                "reply_count": tweet.public_metrics.reply_count,
                "like_count": tweet.public_metrics.like_count,
                "quote_count": tweet.public_metrics.quote_count,
                "text": tweet.text
            })
        }

        if (tweets.length > 0) {
            const tweetsDB = await Tweets.bulkWrite(
                tweets.map((tweet) => {
                    return ({
                        updateOne: {
                            filter: { tweet_id: tweet.tweet_id },
                            update: { $set: tweet },
                            upsert: true
                        }
                    })
                })
            )
            res.json({ message: "The Database has been updated" })
        }
        else {
            res.json({ message: "No Tweets found" })
        }
    } catch (error) {
        if (error.rateLimitError && error.rateLimit) {
            res.json({ message: `You just hit the rate limit! Limit for this endpoint is ${error.rateLimit.limit} requests!` });
        }
        else {
            res.json({ message: error })
        }
    }
})

app.post("/likes", async (req, res) => {
    // Increase Prometheus counter
    getLikesCounter.inc()

    // Get the tweets that have at least 1 like from the DB and it's also not a retweeted tweet at the same time
    const likedTweets = await Tweets.find({ like_count: { $gte: 1 }, text: { $regex: "^(?!RT)" } })


    // If there are liked tweets
    if (likedTweets.length > 0) {

        let likedArray = []
        for (const tweet of likedTweets) {
            try {
                const usersPaginated = await client.tweetLikedBy(tweet.tweet_id, { asPaginator: true, "max_results": 100 })
                // console.log(`--- Tweet ${tweet.tweet_id} ---\nRemaining Requests: ${usersPaginated.rateLimit.remaining}`)
                for await (const user of usersPaginated) {
                    const obj = { tweet_id: tweet.tweet_id, user_id: user.id }
                    likedArray.push(obj)
                }


            } catch (error) {
                // If there's an error thrown by Twitter's API, wait 16 minutes (15 of cooldown + 1 to make sure)
                // Retry again the last request
                console.log("__ERROR__")
                if (error.rateLimitError && error.rateLimit) {
                    console.log(`You just hit the rate limit! Limit for this endpoint is ${error.rateLimit.limit} requests!`);

                    const resetTimeout = error.rateLimit.reset * 1000; // convert to ms time instead of seconds time
                    const timeToWait = resetTimeout - Date.now();
                    console.log("Waiting 16 minutes " + timeToWait)

                    await sleep(960000)

                    const usersPaginated = await client.tweetLikedBy(tweet.tweet_id, { asPaginator: true, "max_results": 100 })
                    // console.log(`--- Tweet ${tweet.tweet_id} ---\nRemaining Requests: ${usersPaginated.rateLimit.remaining}`)
                    for await (const user of usersPaginated) {
                        const obj = { tweet_id: tweet.tweet_id, user_id: user.id }
                        likedArray.push(obj)
                    }
                }
                else {
                    console.log(error)
                }
            }
        }

        // Add all the likes in DB
        // if there are tweets in DB, delete them and insert new ones
        Liked.where({}).countDocuments((err, count) => {
            if (err) {
                console.log(err)
            }
            else {
                if (count > 0) {
                    Liked.deleteMany({}, (callback) => { })
                }
                Liked.bulkWrite(
                    likedArray.map((likedTweet) => {
                        return ({
                            updateOne: {
                                filter: { tweet_id: likedTweet.tweet_id, user_id: likedTweet.user_id },
                                update: { $set: likedTweet },
                                upsert: true
                            }
                        })
                    })
                )
            }

        })
        res.json({ message: "The Database has been updated" })
    }
    else {
        res.json({ message: "No liked Tweets" })
    }

})


app.post("/retweets", async (req, res) => {
    // Increase Prometheus counter
    getRetweetsCounter.inc()

    // Get ONLY the tweets from this user that have been retweeted
    const retweets = await Tweets.find({ retweet_count: { $gte: 1 }, text: { $regex: "^(?!RT)" } })
    if (retweets.length > 0) {

        let tweets = []
        for (const tweet of retweets) {
            try {
                const usersPaginated = await client.tweetRetweetedBy(tweet.tweet_id, { asPaginator: true, "max_results": 100 })
                //console.log(`--- Tweet ${tweet.tweet_id} ---\nRemaining Requests: ${usersPaginated.rateLimit.remaining}`)
                for await (const user of usersPaginated) {
                    console.log(user)
                    const obj = { tweet_id: tweet.tweet_id, user_id: user.id }
                    tweets.push(obj)
                }

            } catch (error) {

                // If there's an error thrown by Twitter's API, wait 16 minutes (15 of cooldown + 1 to make sure)
                // Retry again the last request
                console.log("__ERROR__")
                if (error.rateLimitError && error.rateLimit) {
                    console.log(`You just hit the rate limit! Limit for this endpoint is ${error.rateLimit.limit} requests!`);

                    const resetTimeout = error.rateLimit.reset * 1000; // convert to ms time instead of seconds time
                    const timeToWait = resetTimeout - Date.now();
                    console.log("Waiting 16 minutes " + timeToWait)

                    await sleep(960000)

                    const usersPaginated = await client.tweetLikedBy(tweet.tweet_id, { asPaginator: true, "max_results": 100 })
                    // console.log(`--- Tweet ${tweet.tweet_id} ---\nRemaining Requests: ${usersPaginated.rateLimit.remaining}`)
                    for await (const user of usersPaginated) {
                        const obj = { tweet_id: tweet.tweet_id, user_id: user.id }
                        tweets.push(obj)
                    }
                }
                else {
                    console.log(error)
                }
            }

        }

        // Add all the retweets in DB
        // if there are tweets in DB, delete them and insert new ones
        Retweets.where({}).countDocuments((err, count) => {
            if (err) {
                console.log(err)
            }
            else {
                if (count > 0) {
                    Retweets.deleteMany({}, (callback) => { })
                }

                Retweets.bulkWrite(
                    tweets.map((retweet) => {
                        return ({
                            updateOne: {
                                filter: { tweet_id: retweet.tweet_id, user_id: retweet.user_id },
                                update: { $set: retweet },
                                upsert: true
                            }
                        })
                    })
                )
            }
        })
        res.json({ message: "Retweets added" })
    }
    else {
        res.json({ message: "No tweets found" })
    }
})

app.get("/metrics", async (req, res) => {
    res.set("Content-Type", promClient.register.contentType)
    res.end(await promClient.register.metrics())
})



app.listen(5000, "localhost", () => console.log("Express server running on port 5000"))