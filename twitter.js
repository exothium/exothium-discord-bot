const connectDB = require("./assets/db")
const Tweets = require("./Models/tweetModel")
const Liked = require("./Models/liked_tweetsModel")
const Retweets = require("./Models/retweetModel")
const { TwitterApi } = require('twitter-api-v2');
const { TwitterApiRateLimitPlugin } = require('@twitter-api-v2/plugin-rate-limit') 

// Constant variables
const twitter_account_id = process.env.TWITTER_ACCOUNT_ID
const twitter_bearer_token = process.env.TWITTER_BEARER_TOKEN


const rateLimitPlugin = new TwitterApiRateLimitPlugin()
const appOnlyClient = new TwitterApi(twitter_bearer_token, { plugins: [rateLimitPlugin]});
const client = appOnlyClient.v2;

const getTweets = async () => {
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
            console.log("Tweets added")
        }
        else {
            console.log("No tweets found")
        }
    } catch (error) {
        console.log("__ERROR__")
        if (error.rateLimitError && error.rateLimit) {
            console.log(`You just hit the rate limit! Limit for this endpoint is ${error.rateLimit.limit} requests!`);
        }
        else {
            console.log(error)
        }
    }
}


const getLikes = async () => {

    // Get the tweets that have at least 1 like from the DB and it's also not a retweeted tweet at the same time
    const likedTweets = await Tweets.find({ like_count: { $gte: 1 }, text: { $regex: "^(?!RT)" }})

    
    // If there are liked tweets
    if (likedTweets.length > 0) {

        let likedArray = []
        for (const tweet of likedTweets) {
            try {
                const usersPaginated = await client.tweetLikedBy(tweet.tweet_id, { asPaginator: true, "max_results": 100 } )
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
                    
                    const usersPaginated = await client.tweetLikedBy(tweet.tweet_id, { asPaginator: true, "max_results": 100 } )
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
        console.log("Likes added")  

    }
    else {
        console.log("No liked Tweets")
    }

}


const getRetweets = async () => {
    // Get ONLY the tweets from this user that have been retweeted
    const retweets = await Tweets.find({ like_count: { $gte: 1 }, text: { $regex: "^(?!RT)" }})

    if (retweets.length > 0) {

        let retweets = []
        for (const tweet of retweets) {
            try {
                const usersPaginated = await client.tweetRetweetedBy(tweet.tweet_id, { asPaginator: true, "max_results": 100 })
                //console.log(`--- Tweet ${tweet.tweet_id} ---\nRemaining Requests: ${usersPaginated.rateLimit.remaining}`)
                for await (const user of usersPaginated) {
                    console.log(user)
                    const obj = { tweet_id: tweet.tweet_id, user_id: user.id }
                    retweets.push(obj)
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
                    
                    const usersPaginated = await client.tweetLikedBy(tweet.tweet_id, { asPaginator: true, "max_results": 100 } )
                    // console.log(`--- Tweet ${tweet.tweet_id} ---\nRemaining Requests: ${usersPaginated.rateLimit.remaining}`)
                    for await (const user of usersPaginated) {
                        const obj = { tweet_id: tweet.tweet_id, user_id: user.id }
                        retweets.push(obj)
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
                    retweets.map((retweet) => {
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
        console.log("Retweets added")
    }
    else {
        console.log("No tweets found")
    }
}



const getUserbyUsername = async (username) => {
    let user 
    await client.userByUsername(username).then((userRes) => user = userRes)

    return user
}

function sleep(time) {
    return new Promise(resolve => setTimeout(resolve, time))
}

module.exports = {
    getUserbyUsername: getUserbyUsername,
    getTweets: getTweets,
    getLikes: getLikes,
    getRetweets: getRetweets
}