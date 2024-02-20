`use strict`

const util = require('util'); // Import the 'util' module
const fs = require('fs');
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
const app = express();

app.set('views', `${__dirname}/views`);
app.set('view engine', 'ejs');
app.use(express.static('public'))

let port = 3000;
const filepath = "./config/mongo.json"

function config_check(filepath) {
    try {
        JSON.parse(fs.readFileSync(filepath));
        return true; // Valid JSON
    } catch (error) {
        return false; // Invalid JSON
    }
}

app.use(express.json()); // middleware for handling incoming JSON
app.use(express.urlencoded({ extended: true })); // middleware for handling incoming url-encoded form data

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views/pages');

const handed_enum = {
    'left': 'L',
    'right': 'R',
    'ambi': 'A'
}

const handed_enum_reverse = {
    'L': 'left',
    'R': 'right',
    'A': 'ambi'
}

const kErrors = {
    kNotFoundError: class kNotFoundError extends Error {},
    kInActiveMatch: class kInActiveMatch extends Error {},
    kInsufficientFunds: class kInsufficientFunds extends Error {},
    kMatchNotActive: class kMatchNotActive extends Error {}
}

function check_file_exist(file) {
    try {
        JSON.parse(fs.readFileSync(file))
    }
    catch {
        return false;
    }
    return true;
}

class PlayerSourceJson {

    constructor(file){
        this.config = {}
        // Try requiring the config and if it doesn't exist, use the default config.
        try {
            this.config = require(file)
        }
        catch {
            this.config = {
                "host": "localhost",
                "port": "27017",
                "db": "ee547_hw",
                "opts": {
                    "useUnifiedTopology": true
                }
            }
        }

        this.uri  = `mongodb://${this.config.host}:${this.config.port}/${this.config.db}`
        console.log("connect", this.uri, this.config.opts,)
        this.client = new MongoClient(this.uri, this.config.opts);

        // collection - players details
        this.player = 'player'

        // collection - match details
        this.match = 'match'
    }

    _getPlayersHelper(player) {
        if (player == null) {
            return null;
        }
        const playersArray = Array.isArray(player) ? player : [player];
        const returnArray = [];
    
        for (let i = 0; i < playersArray.length; i++) {
            const currPlayer = playersArray[i];
    
            const return_dict = {
                pid: currPlayer._id,
                name: `${currPlayer.fname}${currPlayer.lname ? ` ${currPlayer.lname}`:''}`,
                handed: handed_enum_reverse[currPlayer.handed],
                is_active: currPlayer.is_active,
                num_join:  currPlayer.num_join ? currPlayer.num_join:0,
                num_won:   currPlayer.num_won  ?  currPlayer.num_won:0,
                num_dq:    currPlayer.num_dq   ? currPlayer.num_dq:0,
                balance_usd_cents: currPlayer.balance_usd_cents,
                total_points:  currPlayer.total_points ? currPlayer.total_points:0,
                total_prize_usd_cents:  currPlayer.total_prize_usd_cents ? currPlayer.total_prize_usd_cents:0,
                efficiency:(currPlayer.num_join > 0) ? (currPlayer.num_won/currPlayer.num_join) : 0,
                in_active_match:  currPlayer.in_active_match ? currPlayer.in_active_match:null
            };
            returnArray.push(return_dict);
        }
        return Array.isArray(player) ? returnArray : returnArray[0];
    }

    async getPlayersByName(fname, lname) {
        let connect;
        let result;
        let query = {};
    
        if (fname && lname) {
            // If both 'fname' and 'lname' are provided, search by both.
            query.fname = fname;
            query.lname = lname;
        } else if (fname || lname) {
            // If only 'fname' or 'lname' is provided, search by the provided field.
            query = {};
            if (fname) {
                query.fname = fname;
            }
            if (lname) {
                query.lname = lname;
            }
        } else {
            // No name parameters provided, return an empty array.
            return [];
        }
    
        try {
            connect = await this.client.connect();
            let db = this.client.db(this.config.db);
            const data = await db.collection(this.player).find(query).toArray();
            result = this._getPlayersHelper(data);
            
            // Sort and return player data as before
            result.sort((a, b) => {
                if (a.name.toLowerCase() < b.name.toLowerCase()) {
                    return -1;
                }
                if (a.name.toLowerCase() > b.name.toLowerCase()) {
                    return 1;
                }
                return 0;
            });
        } catch (error) {
            console.log(error);
            throw new Error("Database error");
        } finally {
            if (connect) connect.close();
        }
        return result;
    }    
    
    async getPlayer(pid) {
        let connect;
        let data;
        try {
            connect = await this.client.connect();
            let db = this.client.db(this.config.db);
            data = await db.collection(this.player).findOne({"_id": new ObjectId(pid)});
        } catch (error) {
            console.log(error)
            return null
          }
          finally {
            if (connect) connect.close();
        }
        return this._getPlayersHelper(data)
    }

    async getPlayers(active_status) {
        let connect;
        let result;
        let query
       if (active_status==='true' || active_status==='false'){
        query = (active_status==='true') ? {'is_active' : true}  : {'is_active' : false}
        }else{
        query = {}
        }
        try {
            connect = await this.client.connect();
            let db = this.client.db(this.config.db);
            const data = await db.collection(this.player).find(query).toArray();
            result =  this._getPlayersHelper(data)
            result.sort((a, b) => {
                if (a.name.toLowerCase() < b.name.toLowerCase()){
                    return -1
                }
                if (a.name.toLowerCase() > b.name.toLowerCase()) {
                    return 1
                }
                return 0
            })  
        } catch (error) {
            console.log(error)
            throw new Error("Database error");
          }
          finally {
            if (connect) connect.close();
        }
        return result
    }

    async createPlayer(fname, lname, handed, initial_balance) {
        let connect;
        try {
            // Validate input data
            if (!fname || !lname || !handed || !initial_balance) {
                throw new Error("Invalid input data");
            }
    
            const balance_usd_cents = Number(initial_balance) * 100;
    
            if (isNaN(balance_usd_cents) || balance_usd_cents < 0) {
                throw new Error("Invalid balance");
            }
    
            // Validate 'handed' enum
            if (!['left', 'right', 'ambi'].includes(handed.toLowerCase())) {
                throw new Error("Invalid handed value");
            }
    
            // Create player object
            const player = {
                balance_usd_cents,
                created_at: new Date(),
                fname,
                lname,
                handed: handed_enum[handed],
                is_active: true,
                num_join: 0,
                num_won: 0,
                num_dq: 0,
                total_points: 0,
                total_prize_usd_cents: 0,
                in_active_match: null
            };
    
            connect = await this.client.connect();
            const db = this.client.db(this.config.db);
            const result = await db.collection(this.player).insertOne(player);
    
            return result.insertedId.toString();
        } catch (error) {
            console.error(error);
            throw new Error("Failed to create player: " + error.message);
        } finally {
            if (connect) connect.close();
        }
    }
    
    async updatePlayer(pid, lname, is_active) {
        let connect;
    
        try {
            connect = await this.client.connect();
            const db = this.client.db(this.config.db);
            const filter = { _id: new ObjectId(pid) };
            const update = { $set: { lname, is_active } };
    
            await db.collection(this.player).updateOne(filter, update);
        } catch (error) {
            throw error;
        } finally {
            if (connect) connect.close();
        }
    }    


    async deletePlayer(pid) {
        let connect;
        let result;
        try {
            connect = await this.client.connect();
            const db = this.client.db(this.config.db);
            const filter = { _id: new ObjectId(pid) };
            result = await db.collection(this.player).deleteOne(filter);
            if (!result || result.deletedCount === 0) {
                return null;
            }
        } catch (error) {
            return null;
        } finally {
            if (connect) connect.close();
        }
    }

    async addBalance(pid,amount){
        let connect;
        let result;
        let prev_balance;
        try {
            connect = await this.client.connect();
            let db = this.client.db(this.config.db);
            const filter = {_id: new ObjectId(pid)};
            const curr_player = await db.collection(this.player).findOne(filter);
            prev_balance = curr_player.balance_usd_cents;
            const update = {$set: {balance_usd_cents:  prev_balance+amount}};
            const options = { returnDocument: "after"};
            const res = await db.collection(this.player).findOneAndUpdate(filter,update,options)
            result = {
                "old_balance_usd_cents" : prev_balance,
                "new_balance_usd_cents" : res.value.balance_usd_cents
            }
            return result;
        } catch (error) {
            return null
          }
          finally {
            if (connect) connect.close();
        }
    }

    async _getMatchesHelper(matches){
        if (matches==null) return null;
        const matchesArray = Array.isArray(matches) ? matches : [matches];
        const returnArray = [];
        for(let i=0;i< matchesArray.length;i++){
            const currMatch = matchesArray[i];
            const p1 = await this.getPlayer(currMatch.p1_id);
            const p2 = await this.getPlayer(currMatch.p2_id);
            const return_dict = {
                mid : currMatch._id,
                entry_fee_usd_cents: currMatch.entry_fee_usd_cents,
                p1_id: currMatch.p1_id,
                p1_name: p1.name,
                p1_points: currMatch?.p1_points ? currMatch.p1_points:0,
                p2_id : currMatch.p2_id,
                p2_name : p2.name,
                p2_points: currMatch?.p2_points ? currMatch.p2_points : 0,
                winner_pid : currMatch?.ended_at ? currMatch.winner_pid : null,
                is_dq: currMatch?.is_dq ? currMatch.is_dq : false,
                is_active: currMatch?.ended_at == null ? true:false,
                prize_usd_cents: currMatch.prize_usd_cents,
                age: Math.floor((new Date() - currMatch.created_at)/1000),
                ended_at: currMatch?.ended_at ? currMatch.ended_at : null
            }
            returnArray.push(return_dict);
        }
        return Array.isArray(matches) ? returnArray : returnArray[0];
    }


    async getMatches(active_status){
        let connect;
        let result;
        let query
        query = {ended_at:null}
       if (active_status==='true' || active_status==='false'){
        query = (active_status==='true') ? {ended_at:null}  : {ended_at:{$ne:null}}
        }else if(active_status==='*'){
        query = {}
        }
        try{
            connect = await this.client.connect();
            let db = this.client.db(this.config.db);
            const data = await db.collection(this.match).find(query).toArray();
            result = await this._getMatchesHelper(data)
            result.sort((a,b) => {
                if (a.prize_usd_cents < b.prize_usd_cents){
                    return 1
                }
                if (a.prize_usd_cents > b.prize_usd_cents){
                    return -1
                }
                return 0
            })
            return result;
        } catch(error){
            console.log(error)
            throw new Error("error");
        } finally{
            if (connect) connect.close();
        }
    }

    async getMatch(mid){
        let connect;
        let data;
        try{
            connect = await this.client.connect();
            let db = this.client.db(this.config.db);
            data = await db.collection(this.match).findOne({"_id": new ObjectId(mid)});
        } catch(error){
            console.log("---GET MATCH----")
            console.log(error)
            throw new Error("Database error");
        }
        finally {
            if (connect) connect.close();
        }
        return this._getMatchesHelper(data)
    }

    async createMatch(pid1,pid2,entry_fee_usd_cents, prize_usd_cents){
        let result;
        let connect;
        let player1
        let player2;
        try {
            connect = await this.client.connect();
            let db = this.client.db(this.config.db);
            player1 = await db.collection(this.player).findOne({_id: new ObjectId(pid1)})
            player2 = await db.collection(this.player).findOne({_id: new ObjectId(pid2)})
            // Check if the players exist
            if (!player1 || !player2) {
                throw new kErrors.kNotFoundError()
            }
            // Check if the players are in an active match currently
            if (player1.in_active_match || player2.in_active_match) {
                throw new kErrors.kInActiveMatch()
            }
            // Check if the players have sufficient funds
            if (player1.balance_usd_cents < entry_fee_usd_cents || 
                player2.balance_usd_cents < entry_fee_usd_cents) {
                throw new kErrors.kInsufficientFunds()
            }
            // Create the match if all the above conditions are satisfied
            let match = {
                created_at: new Date(),
                ended_at: null,
                entry_fee_usd_cents: entry_fee_usd_cents,
                is_dq: false,
                p1_id: pid1,
                p1_points: 0,
                p2_id: pid2,
                p2_points: 0,
                prize_usd_cents: prize_usd_cents
            }
            // Insert the above document into the collection
            result = await db.collection(this.match).insertOne(match)
            // Update player's balance and match ID
            let update_dict = {
                $inc:{balance_usd_cents:-1*match.entry_fee_usd_cents, num_join:1},
                $set:{in_active_match:result.insertedId}
            }
            await db.collection(this.player).updateOne({_id: new ObjectId(match.p1_id)}, update_dict)
            await db.collection(this.player).updateOne({_id: new ObjectId(match.p2_id)}, update_dict)
            return result.insertedId.toString();
        } catch(error){
            throw error;
        } finally{
            if (connect) connect.close();
        }
    }

    async awardPoints(mid,pid,points){
        let player;
        let match;
        let connect;
        try{
            connect = await this.client.connect();
            let db = this.client.db(this.config.db);
            player = await db.collection(this.player).findOne({_id: new ObjectId(pid)})
            match = await  db.collection(this.match).findOne({_id: new ObjectId(mid)})
            if (!match || !player) {
                throw new kErrors.kNotFoundError()
            }
            if (match.ended_at != null) {
                throw new kErrors.kMatchNotActive()
            }
            if (pid != match.p1_id && pid != match.p2_id) {
                throw new Error()
            }
            let match_update = {$inc:{
                p1_points: pid == match.p1_id ? points : 0,
                p2_points: pid == match.p2_id ? points : 0
            }}
            let player_update = {$inc:{
                total_points: points
            }}
             // Update match
             await db.collection(this.match).updateOne({_id: new ObjectId(mid)}, match_update)
             await db.collection(this.player).updateOne({_id: new ObjectId(pid)}, player_update)
             return;
        } catch(error){
            throw error;
        } finally{
            if (connect) connect.close();
        }
    }

    async endMatch(mid){
        let match;
        let connect;
        try{
            connect = await this.client.connect();
            let db = this.client.db(this.config.db);
            match = await db.collection(this.match).findOne({_id: new ObjectId(mid)})
            if (!match) {
                throw new kErrors.kNotFoundError()
            }
            if (match.ended_at != null || match.p1_points === match.p2_points) {
                throw new kErrors.kMatchNotActive()
            }
            let winner_pid = match.p1_points > match.p2_points ? match.p1_id : match.p2_id
            let match_update = {
                $set: {ended_at: new Date(), winner_pid: new ObjectId(winner_pid)}
            }
            let player_update = {
                $set: {in_active_match:null}
            }
            let winner_update = {
                $inc: {num_won: 1, balance_usd_cents:match.prize_usd_cents, total_prize_usd_cents:match.prize_usd_cents}
            }
            await db.collection(this.match).updateOne({_id: new ObjectId(mid)}, match_update)
            await db.collection(this.player).updateMany({in_active_match: new ObjectId(mid)}, player_update)
            await db.collection(this.player).updateOne({_id: new ObjectId(winner_pid)}, winner_update)
            return
        }catch(error){
            throw error
        }finally{
            if (connect) connect.close();
        }
    }

    async getTotalPlayers() {
        let connect;
        try {
            connect = await this.client.connect();
            const db = this.client.db(this.config.db);
            const totalPlayers = await db.collection(this.player).countDocuments();
            return totalPlayers;
        } catch (error) {
            console.log(error);
            throw new Error("Database error");
        } finally {
            if (connect) connect.close();
        }
    }

    async getActivePlayers() {
        let connect;
        try {
            connect = await this.client.connect();
            const db = this.client.db(this.config.db);
            const activePlayers = await db.collection(this.player).countDocuments({ is_active: true });
            return activePlayers;
        } catch (error) {
            console.log(error);
            throw new Error("Database error");
        } finally {
            if (connect) connect.close();
        }
    }

    async getInactivePlayers() {
        let connect;
        try {
            connect = await this.client.connect();
            const db = this.client.db(this.config.db);
            const inactivePlayers = await db.collection(this.player).countDocuments({ is_active: false });
            return inactivePlayers;
        } catch (error) {
            console.log(error);
            throw new Error("Database error");
        } finally {
            if (connect) connect.close();
        }
    }

    async getAverageBalance() {
        let connect;
        try {
            connect = await this.client.connect();
            const db = this.client.db(this.config.db);
            const pipeline = [
                {
                    $group: {
                        _id: null,
                        averageBalance: {
                            $avg: "$balance_usd_cents",
                        },
                    },
                },
            ];
            const result = await db.collection(this.player).aggregate(pipeline).toArray();
            if (result.length === 0) {
                return 0; // Handle the case when there are no players
            }
            return result[0].averageBalance / 100; // Convert cents to dollars
        } catch (error) {
            console.log(error);
            throw new Error("Database error");
        } finally {
            if (connect) connect.close();
        }
    }

    async disQualify(mid,pid) {
        let match;
        let player;
        let connect;
        try{
            connect = await this.client.connect();
            let db = this.client.db(this.config.db);
            match = await db.collection(this.match).findOne({_id: new ObjectId(mid)})
            player = await db.collection(this.player).findOne({_id: new ObjectId(pid)})
            if (!match || !player) {
                throw new kErrors.kNotFoundError()
            }
            if (match.ended_at != null) {
                throw new kErrors.kMatchNotActive()  
            }
            if (pid != match.p1_id && pid != match.p2_id) {
                throw new Error()
            }
            // Set the other player as the winner
            let winner_pid = pid == match.p1_id ? match.p2_id : match.p1_id
            let match_update = {
                $set: {ended_at: new Date(), winner_pid: new ObjectId(winner_pid), is_dq:true}
            }
            let player_update = {
                $set: {in_active_match:null}
            }
            let winner_update = {
                $inc: {num_won: 1, balance_usd_cents:match.prize_usd_cents, total_prize_usd_cents:match.prize_usd_cents}
            }
            let dq_update = {
                $inc: {num_dq:1}
            }
             // Update the match
            await db.collection(this.match).updateOne({_id: new ObjectId(mid)}, match_update)
            await db.collection(this.player).updateMany({in_active_match: new ObjectId(mid)}, player_update)
            await db.collection(this.player).updateOne({_id: new ObjectId(winner_pid)}, winner_update)
            await db.collection(this.player).updateOne({_id: new ObjectId(pid)}, dq_update)
            // return
            return 
        } catch(error){
            throw error
        } finally{
            if (connect) connect.close();
        }
    }
}

let player_data = new PlayerSourceJson(filepath)

// to check the status of the server
app.get('/ping', (req, res) => {
    res.sendStatus(204);
})

// Serve the players.html page using EJS templates
app.get('/players.html', (req, res) => {
    // Render the "list" template here and send it as a response
    res.render('player/list');
});

// Serve the create.html page using EJS templates
app.get('/player/create.html', (req, res) => {
    // Render the "create" template here and send it as a response
    res.render('player/create');
}); 


// GET /api/player/:pid - get single player
// - return 200 and player info if found
// - return 404 if not found
app.get('/api/player/:pid', async (req, res) => {
    await player_data.getPlayer(req.params.pid)
    .then((player) => {
        if (player !== null) {
            res.status(200).json(player); // Use res.json() to send JSON response
        } else {
            res.sendStatus(404);
        }
    })
    .catch((err) => res.sendStatus(404));
});


app.get('/api/player', async (req, res) => {
    const active_status = req.query.is_active;
    const fname = req.query.fname;
    const lname = req.query.lname;
    
    if (fname || lname) {
        // If 'fname' or 'lname' is provided, construct 'fullName' and search for players by name.
        const fullName = (fname && lname) ? `${fname} ${lname}` : (fname || lname);
        const players = await player_data.getPlayersByName(fname, lname, fullName);
        if (players.length > 0) {
            res.status(200).json(players);
        } else {
            res.sendStatus(404); // Player not found
        }
    } else {
        // If no specific name parameters are provided, filter by 'is_active' status.
        const players = await player_data.getPlayers(active_status);
        res.status(200).json(players);
    }
});

app.get('/dashboard.html', async (req, res) => {
    try {
        const totalPlayers = await playerSource.getTotalPlayers(); 
        const activePlayers = await playerSource.getActivePlayers(); 
        const inactivePlayers = await playerSource.getInactivePlayers(); 
        const averageBalance = await playerSource.getAverageBalance(); 

        res.render('dashboard', { totalPlayers, activePlayers, inactivePlayers, averageBalance });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});


app.post('/api/player', async (req, res) => {
    const { fname, lname, handed, initial_balance_usd_cents } = req.body;

    // Ensure the required fields are present and match the data schema
    if (!fname || !/^[a-zA-Z]+$/.test(fname) || typeof fname !== 'string') {
        res.status(422).send('invalid fields: fname');
        return;
    }

    if (lname && (!/^[a-zA-Z]+$/.test(lname) || typeof lname !== 'string')) {
        res.status(422).send('invalid fields: lname');
        return;
    }

    console.log("Handed", handed);

    const validHanded = ['left', 'right', 'ambi'];
    if (
        !handed ||
        (typeof handed !== 'string' || !validHanded.includes(handed.toLowerCase()))
    ) {
        res.status(422).send('invalid fields: handed');
        return;
    }

    console.log("Request body:", req.body);

    const initial_balance_usd_cents_numeric = parseFloat(initial_balance_usd_cents);

    if (
        isNaN(initial_balance_usd_cents_numeric) ||
        initial_balance_usd_cents_numeric < 0 ||
        !Number.isInteger(initial_balance_usd_cents_numeric)
    ) {
        res.status(422).send('invalid fields: initial_balance_usd_cents');
        return;
    }

    // Convert handed to the enum format
    const handed_value = handed.toLowerCase();  // Add this line

    try {
        const result = await player_data.createPlayer(
            fname,
            lname,
            handed_value, // Change 'handed_enum_value' to 'handed_value'
            initial_balance_usd_cents_numeric // Use the numeric value
        );

        const player = await player_data.getPlayer(result);
        res.status(200).send(JSON.stringify(player));
    } catch (err) {
        res.sendStatus(500);
    }
});

// POST - /api/player/pid - update player details
// – return 200 on success.
// – return 422 error on failure.
app.post('/api/player/:pid', async (req, res) => {
    console.log(req.params.pid)
    if (!ObjectId.isValid(req.params.pid)) {
        res.status(404).send('Not Found'); // Change the status code to 404
        return;
    }
    
    const pid = req.params.pid;
    const lname = req.body.lname;
    let is_active = req.body.active;

    if (is_active !== undefined && ['1', 'true', 't', 'on'].includes(is_active.toLowerCase())) {
        is_active = true;
    } else {
        is_active = false;
    }

    try {
        await player_data.updatePlayer(pid, lname, is_active);
        const final_res = await axios(`http://localhost:3000/api/player/${req.params.pid}`);
        res.status(200).send(final_res.data);
    } catch (error) {
        res.sendStatus(402);
    }
});

// delete a single player
app.delete('/api/player/:pid', async (req, res) => {
    const result = await player_data.deletePlayer(req.params.pid);
    if (result !== null) {
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

// POST /api/deposit/player/pid-add positive currency to player[pid] balance
// – 200 on success.
// – 404 if player does not exist.
// – 400 if invalid amount.
app.post('/api/deposit/player/:pid', async(req,res) => {
    const pid = req.params.pid;
    const amount = req.query.amount_usd_cents;
    // chceking if amount is a valid number
    if (!(amount) ||isNaN(Number(amount)) || Number(amount) <= 0 || !Number.isInteger(Number(amount))){
        res.sendStatus(400);
        return;
    } 
    await player_data.addBalance(pid,Number(amount))
    .then((result) => {
        if(result!==null){
            res.status(200).send(result)
            }else{
                res.sendStatus(404)
            }
    })
    .catch((err) => {
        console.log(err)
        res.sendStatus(404)
    })
})

// get single match
app.get('/api/match/:mid', async(req,res) => {
    await player_data.getMatch(req.params.mid)
    .then((match) => {
        if(match!==null){
            res.status(200).send(JSON.stringify(match))
        }else{
            res.sendStatus(404)
        }
    })
    .catch((err) => {
        res.sendStatus(404)
    })
})

// GET /api/match - get all matches(is_active(optional))
// - return 200 and match info if found
// - return 404 is match not found
app.get('/api/match', async(req,res) => {
    const active_status = req.query.is_active;
    await player_data.getMatches(active_status)
    .then((matches) => {
        res.status(200).send(JSON.stringify(matches))
    })
    .catch((err) => {
        console.log(err)
        res.sendStatus(404)
    })
})

// POST /api/match - Create new Match
// - 200 on success
// - 404 if player1 or player2 does not exist
// - 409 is either player is already in an active match
// - 402 if insufficient account balance for either player
// - 400 else
app.post('/api/match' , async(req,res)=> {
    const player1_id = req.body.p1_id;
    const player2_id = req.body.p2_id;
    const entry_fee = req.body.entry_fee_usd_cents;
    const prize = req.body.prize_usd_cents;
    let error = false;
    if (!(entry_fee) ||isNaN(Number(entry_fee)) || Number(entry_fee) < 0 || !Number.isInteger(Number(entry_fee))){
        error = true;
    }
    if (!(prize) ||isNaN(Number(prize)) || Number(prize) < 0 || !Number.isInteger(Number(prize))){
        error = true;
    }
    if(!error){
        await player_data.createMatch(player1_id,player2_id,Number(entry_fee),Number(prize))
        .then(async (result) => {
            const final_res = await axios(`http://localhost:3000/api/match/${result}`)
            res.status(200).send(final_res.data)
        })
        .catch((err) => {
            console.log(err)
            if (err instanceof kErrors.kNotFoundError) {res.sendStatus(404)}
            else if (err instanceof kErrors.kInActiveMatch) {res.sendStatus(409)}
            else if (err instanceof kErrors.kInsufficientFunds) {res.sendStatus(402)}
            else {res.sendStatus(400)}
        })
    }else{
        res.sendStatus(400)
    }
})

// POST /api/match/:mid/award/:pid - Add points
// - 200 if success
// - 404 if player or match does not exist
// - 409 if match not active
// - 400 else
app.post('/api/match/:mid/award/:pid', async(req,res) => {
    if (!ObjectId.isValid(req.params.mid)) {
        res.sendStatus(404)
        return 
    }
    if (!ObjectId.isValid(req.params.pid)) {
        res.sendStatus(404)
        return 
    }
    let points = req.query.points;
    if(points.includes(".")){
        res.sendStatus(400);
        return;
    }
    if (!(points) ||isNaN(Number(points)) || Number(points) <=0 || !Number.isInteger(Number(points))){
        res.sendStatus(400);
        return;
    }
    await player_data.awardPoints(req.params.mid,req.params.pid,Number(points))
    .then(async () => {
        const final_res = await axios(`http://localhost:3000/api/match/${req.params.mid}`)
        res.status(200).send(final_res.data)
    })
    .catch((err) => {
        if (err instanceof kErrors.kNotFoundError) {
            res.sendStatus(404)
        }
        else if(err instanceof kErrors.kMatchNotActive) {
            res.sendStatus(409)
        }
        else {
            res.sendStatus(400)
        }
    })
})

// POST /api/match/:mid/end - End Match
// - 200 if success
// - 404 if match doesn't exist
// - 409 is match not active or points tied
app.post('/api/match/:mid/end', async(req,res) => {
    if (!ObjectId.isValid(req.params.mid)) {
        res.sendStatus(404)
        return 
    }
    await player_data.endMatch(req.params.mid)
    .then(async() => {
        const final_res = await axios(`http://localhost:3000/api/match/${req.params.mid}`)
        res.status(200).send(final_res.data)
    })
    .catch((err) => {
        console.log(err)
        if (err instanceof kErrors.kNotFoundError) {
            res.sendStatus(404)
        }
        else if (err instanceof kErrors.kMatchNotActive) {
            res.sendStatus(409)
        }
        else {
            res.sendStatus(400)
        }
    })
})

// POST /api/match/:mid/disqualify/:pid - Disqualify Match
// - 200 if success
// - 404 if player or match doesn't exist
// - 409 if match not active
// - 400 else
app.post('/api/match/:mid/disqualify/:pid', async(req,res) => {
    if (!ObjectId.isValid(req.params.mid)) {
        res.sendStatus(404)
        return 
    }
    if (!ObjectId.isValid(req.params.pid)) {
        res.sendStatus(404)
        return 
    }
    await player_data.disQualify(req.params.mid,req.params.pid)
    .then(async() => {
        const final_res = await axios(`http://localhost:3000/api/match/${req.params.mid}`)
        res.status(200).send(final_res.data)
    })
    . catch((err) => {
        if (err instanceof kErrors.kNotFoundError) {
            res.sendStatus(404)
        }
        else if (err instanceof kErrors.kMatchNotActive) {
            res.sendStatus(409)
        }
        else {
            res.sendStatus(400)
        }
    })
})

/*
app.get('/player/create.html', async (req, res) => {
    try {
        // Render the 'create' EJS template
        const render = util.promisify(res.render).bind(res);
        res.render('layout', {
            body: await render('pages/player/create')
        });
    } catch (err) {
        console.log(err);
        res.status(404).send('Not found');
    }
});
*/

/*
app.get('/players.html', async (req, res) => {
    try {
        let active_status; // Define your 'active_status' here

        // Fetch player data from the API
        const response = await axios.get(`http://localhost:3000/api/player?is_active=${active_status}`);
        const players = response.data;

        // Render the EJS template and pass 'players' as a variable
        const render = util.promisify(res.render).bind(res);
        res.render('layout', {
            body: await render('pages/player/list', { players })
        });
    } catch (err) {
        console.log(err);
        res.status(404).send('Not found');
    }
});
*/

app.get('/player/:pid/edit.html', async (req, res) => {
    const playerId = req.params.pid;
    console.log("PID:", req.params.pid)
    // Fetch player details using playerId and render the edit page
    try {
        // Fetch player details using playerId and pass it to the edit template
        const player = await player_data.getPlayer(playerId);
        if (player !== null) {
            res.render('player/edit', { player }); // Assuming 'player/edit' is the correct path to your edit template
        } else {
            res.status(404).send('Player not found');
        }
    } catch (err) {
        console.log(err);
        res.status(500).send('Internal Server Error');
    }
});


console.log("hello")
if (!config_check(filepath)) {
    console.error("Invalid JSON configuration file.");
    process.exit(2);
}

app.listen(port, () => {
    console.log(`app listening on port ${port}`)
})
