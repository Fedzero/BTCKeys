# NodeJS BTC Key Bot by UKF - lebgh0st

### Developer: Hassan J. - lebgh0st/UKF
### Steam: http://steamcommunity.com/id/lebgh0st
### Reddit: https://www.reddit.com/user/lebgh0st/
### Discord: https://discord.gg/QhGfREv

## Instructions

1. Download nodejs from https://nodejs.org/
2. Download all of the files off github.
3. Place all of your files inside a folder and call it 'steambot'
4. Open terminal/command prompt.
5. cd YOUR_LOCATION/steambot
6. Make sure to be in the same location as your files and write the following command and press enter: 'npm install'
7. Write the following command and press enter [NOTE THAT: sudo/admin permissions required]: npm install -g blockchain-wallet-service 
8. If you encounter an es6-promise module error, just do 'npm install es6-promise' or the module name and same if any of the modules are missing.
9. Download XAMPP or use phpmyadmin (on your cpanel if you're hosting it online).
10. Create a database user & database, and give it required permissions (create, update & delete records).
11. Insert the transactions.sql inside your database.
12. Configure the config.js file.
13. Open terminal/console, cd YOUR_LOCATION/steambot
14. Write the following command and press enter: blockchain-wallet-service start --port 3000
15. Open a second terminal/command prompt.
16. Write the following command and press enter: node steambot.js
17. Report errors and issues in this group: http://steamcommunity.com/groups/gh0stdev or open an issue ticket on github, and I will take a look.

## Common questions:

### Blockchain.info usage
<p>Create a bitcoins wallet over here -> https://blockchain.info/wallet/#/login<br/></p>

### What is my GUID?
<p>It's your Blockchain login.</p>

### Do I need an API key?
<p>No, you don't, keep the field empty.</p>

### Where do I find my xpub?
<p>Make sure to be logged in on Blockchain.info<br/>
Go to Settings -> Addresses -> My Bitcoin Wallet -> Manage -> More Options -> Show xpub</p>

### What is a static_address?
<p>It is the address that we are going to use to store your bitcoins on the bot, it's an undirected way to use them, in other words, you own them, but you can't use them unless you transfer them to your main wallet.<br/>

What do I do with it?<br/>
Keep it empty, until you boot the bot and it will generate addresses.<br/>
Once it does that, do !balance (as the admin) and copy and paste the generated address into your static_address field in config.js file.</p>

## Donations
<p>Donations are appreciated and welcome.<br/>
BTC address: 15mjZXmNAuSHzCfRanxvsmjVu9nZKn77C6<br/>
Trade URL: https://steamcommunity.com/tradeoffer/new/?partner=168803984&token=DdE7HEab<br/>
They help me pay my tuition fees, buy food and stay alive.</p>
