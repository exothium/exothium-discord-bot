const { Intents, Client } = require('discord.js');
const dotenv = require("dotenv").config()
const Retweet = require("./Models/retweetModel")
const connectDB = require("./assets/db")
const { getUserbyUsername, getTweets, getLikes, getRetweets } = require('./twitter');
const { default: axios } = require('axios');
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] })
const { TwitterApi } = require('twitter-api-v2');
const { TwitterApiRateLimitPlugin } = require('@twitter-api-v2/plugin-rate-limit')

// Constant variables
const twitter_account_id = process.env.TWITTER_ACCOUNT_ID
const twitter_bearer_token = process.env.TWITTER_BEARER_TOKEN


const rateLimitPlugin = new TwitterApiRateLimitPlugin()
const appOnlyClient = new TwitterApi(twitter_bearer_token, { plugins: [rateLimitPlugin] });
const twitterClient = appOnlyClient.v2;


client.on("messageCreate", async (message) => {
    if (message.content === "!getTweets" && message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
        message.channel.send("Adding...")
        await getTweets()
        message.reply("Tweets added into the Database")
    }
    else if (message.content === "!getLikes" && message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
        await getLikes()
        message.channel.send("Adding...")
        message.reply("Likes added into the Database")
    }
    else if (message.content === "!getRetweets" && message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
        await getRetweets()
        message.channel.send("Adding...")
        message.reply("Retweets added into the Database")
    }
})

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) {
        return
    }

    const { commandName, options } = interaction

    if (commandName === "likes") {
        const username = options.get("username").value

        const user = await twitterClient.userByUsername(username).then((res) => { return res.data })

        if (!user) {
            interaction.reply('User does not exist')
            return
        }
        console.log(user.id)

        await axios.get(`http://localhost:5000/likes/${user.id}`).then((res) => {
            if (res.data.likes > 0) {
                interaction.reply(`User @${username} liked ${res.data.likes} tweets.`)
            }
            else {
                interaction.reply(`User @${username} hasn't liked any tweet yet.`)
            }
        })
        
    }

    else if (commandName === "retweets") {
        const username = options.get("username").value

        const user = await getUserbyUsername(username)

        if (!user) {
            interaction.reply('User does not exist')
            return
        }

        Retweet.countDocuments({ user_id: user.data.id }, (err, count) => {
            if (err) {
                console.log(err)
            }
            else {
                interaction.reply(`User @${username} retweeted ${count} times on Exothium`)
            }
        })
    }
})


client.on("ready", () => {
    // Get all the commands from the server and create your own
    const guild = client.guilds.cache.get(process.env.GUILD_ID)

    let commands;
    if (guild) {
        commands = guild.commands
    } else {
        commands = client.application?.commands
    }
    commands.create({
        name: 'likes',
        description: 'Checks how many likes a user liked on Exothium\'s Twitter page',
        options: [
            {
                name: 'username',
                description: 'User\'s @ on Twitter',
                required: true,
                type: 3
            }
        ]
    })
    commands.create(
        {
            name: 'retweets',
            description: 'Checks how many times a user retweeted on Exothium\'s Twitter page',
            options: [
                {
                    name: 'username',
                    description: 'User\'s @ on Twitter',
                    required: true,
                    type: 3
                }
            ]
        })

    console.log('Bot is ready')
})

client.login(process.env.DISCORD_TOKEN)