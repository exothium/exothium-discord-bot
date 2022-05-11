const dotenv = require("dotenv").config()
const { Intents, Client } = require('discord.js');
const { default: axios } = require('axios');
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] })

client.on("messageCreate", async (message) => {
    if (message.content === "!getTweets" && message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
        message.channel.send("Adding...")
        await axios.post("http://localhost:5000/tweets").then((res) => {
            message.reply(res.data.message)
        })

    }
    else if (message.content === "!getLikes" && message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
        message.channel.send("Adding...")
        await axios.post("http://localhost:5000/likes").then((res) => {
            message.reply(res.data.message)
        })
    }
    else if (message.content === "!getRetweets" && message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
        message.channel.send("Adding...")
        await axios.post("http://localhost:5000/retweets").then((res) => {
            message.reply(res.data.message)
        })
    }
})

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) {
        return
    }

    const { commandName, options } = interaction

    if (commandName === "likes") {
        const username = options.get("username").value

        await axios.get(`http://localhost:5000/likes/${username}`).then((res) => {
            interaction.reply(res.data.message)
        })

    }

    else if (commandName === "retweets") {
        const username = options.get("username").value
        await axios.get(`http://localhost:5000/retweets/${username}`).then((res) => {
            interaction.reply(res.data.message)
        })
    }

    else if (commandName === "followers") {
        await axios.get("http://localhost:5000/followers").then((res) => {
            interaction.reply(res.data.message)
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
    commands.create({
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
    commands.create({
        name: 'followers',
        description: 'Checks how many people are following Exothium\'s Twitter page',
    })

    console.log('Bot is ready')
})

client.login(process.env.DISCORD_TOKEN)