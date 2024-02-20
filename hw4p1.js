const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const express = require('express')
const app = express()
const mcf = './config/mongo.json';


function config_check(configfile){
    try{
        JSON.parse(fs.readFileSync(configfile));
    }
    catch{
        return false;
    }
    return true;
}

class PlayerSourceJson{
    constructor(file){
        this.config = {};
        this.collection = "player";
        try{
            this.config = require(file);
        }
        catch{
            this.config = {
                "host": "localhost",
                "port": "27017",
                "db": "ee547_hw",
                "opts": {
                    "useUnifiedTopology": true
                }
            }
        }

        this.uri = `mongodb://${this.config.host}:${this.config.port}`
        this.client = new MongoClient(this.uri, this.config.opts);
    }

    getPlayer(pid, callback){
        this.client.connect((err, connection) => {
            if(!err){
                let data_b = this.client.db(this.config.db);
                data_b.collection(this.collection).find({"_id":ObjectId(pid)}).toArray((err, data) => {
                    if(!err){
                        if(data.length > 0){
                            connection.close();
                            callback(null, data[0]);
                        }
                        else{
                            connection.close();
                            callback(true, null);
                        }
                    }
                    else{
                        connection.close();
                        callback(err, null);
                    }
                })
            }
            else{
                process.exit(5);
            }
        })
    }

    createPlayer(fname, lname, handed, balance_initial, callback) {
        this.client.connect((err, connection) => {
            if(!err){
                let data_b = this.client.db(this.config.db);
                data_b.createCollection(this.collection, (err, collection) => {
                    let player_dict = {
                        fname: fname,
                        lname: lname,
                        handed: {
                            left: 'L',
                            right: 'R',
                            ambi: 'A'
                        }[handed.toLowerCase()],
                        is_active: true,
                        balance_usd: balance_initial,
                        created_at: new Date()
                    };
                    data_b.collection(this.collection).insertOne(player_dict, (err, data) => {
                        if(!err) {
                            connection.close();
                            callback(null, data.insertedId);
                        }
                        else{
                            connection.close();
                            callback(err, null);
                        }
                    })
                })
            }
            else{
                process.exit(5);
            }
        })
    }

    updatePlayer(pid, lname, active, callback) {
        this.client.connect((err, connection) => {
            if(!err){
                let data_b = this.client.db(this.config.db);
                let update_dict = {$set:{}};
                if(lname != null){
                    update_dict.$set.lname = lname
                }
                if(active != null){
                    update_dict.$set.is_active = active;
                }
                data_b.collection(this.collection).updateOne({_id:ObjectId(pid)}, update_dict, (err, data) => {
                    if(!err){
                        if(data.matchedCount > 0){
                            connection.close();
                            callback(null, data);
                        }
                        else{
                            connection.close();
                            callback(true, null);
                        }
                    }
                    else{
                        connection.close();
                        callback(err, null);
                    }
                })
            }
            else{
                process.exit(5);
            }
        })
    }

    deletePlayer(pid, callback) {
    this.client.connect(async (err, connection) => {
        if (!err) {
            try {
                const data_b = this.client.db(this.config.db);
                const data = await data_b.collection(this.collection).deleteOne({ _id: ObjectId(pid) });

                if (data.deletedCount > 0) {
                    connection.close();
                    callback(null, data);
                } else {
                    connection.close();
                    callback(true, null);
                }
            } catch (err) {
                connection.close();
                callback(err, null);
            }
        } else {
            process.exit(5);
        }
    });
}


    getBalance(pid, balance_new, callback){
        this.client.connect(async (err, connection) => {
            if(!err){
                let data_b = this.client.db(this.config.db);

                let player = await data_b.collection(this.collection).findOne({_id:ObjectId(pid)});

                if(player){

                    let return_dict = {'old_balance_usd': player?.balance_usd, 'new_balance_usd': null}
                    
                    let update_dict = {$set: {}};

                    if(balance_new != null){
                        update_dict.$set.balance_usd = (Number(player?.balance_usd) + (balance_new > 0 ? balance_new : 0)).toFixed(2);
                        return_dict.new_balance_usd = update_dict.$set.balance_usd;
                    }

                    data_b.collection(this.collection).updateOne({_id:ObjectId(pid)}, update_dict, (err, data) => {
                        if(!err){
                            if(data.matchedCount > 0){
                                connection.close();
                                callback(null, return_dict);
                            }
                            else{
                                connection.close();
                                callback(true, null);
                            }
                        }
                        else{
                            connection.close();
                            callback(err, null);
                        }
                    })
                }
                else{
                    connection.close();
                    callback(true, null);
                }
            }
            else{
                process.exit(5);
            }
        })
    }

    getPlayers(callback) {
        this.client.connect((err, connection) => {
            if(!err){
                let data_b = this.client.db(this.config.db);
                data_b.collection(this.collection).find().toArray((err, data) => {
                    if(!err){
                        let player_array = this._formatPlayer(data);
                        player_array.sort((a, b) => {
                            if(a.name > b.name){
                                return 1;
                            }
                            if(a.name < b.name){
                                return -1;
                            }
                            return 0;
                        });
                        connection.close();
                        callback(null, player_array);
                    }
                    else{
                        connection.close();
                        callback(err, null);
                    }
                })
            }
            else{
                process.exit(5);
            }
        })
    }

    _formatPlayer(player) {
        if (player == null) {
            return null;
        }

        if (Array.isArray(player)) {
            return player.map(this._formatPlayer);
        }

        let dict = {
            pid: player._id,
            name: `${player.fname}${player.lname ? ` ${player.lname}` : ''}`,
            handed: {
                L: 'left',
                R: 'right',
                A: 'ambi'
            }[player.handed],
            is_active: player.is_active,
            balance_usd: player.balance_usd
        };

        return dict;
    }

    _isCharacter(char) {
        return typeof char === "string" && (/^[a-zA-Z]+$/).test(char);
    }
}

app.get('/ping', (req, res) => {
    res.sendStatus(204);
})

app.get('/player', (req, res) => {
    let players = new PlayerSourceJson(mcf);
    players.getPlayers((err, data) => {
        if(!err){
            res.status(200).send(JSON.stringify(data))
        } 
    });
})

app.get('/player/:pid', (req, res) => {
    let players = new PlayerSourceJson(mcf);
    players.getPlayer(req.params.pid, (err, data) => {
        if(!err){
            let player = players._formatPlayer(data);
            res.status(200).send(JSON.stringify(player));
            return; 
        }
        else{
            res.sendStatus(404);
            return; 
        }
    })
})

app.post('/player', (req, res) => {
    let players = new PlayerSourceJson(mcf);
    let fname = req.query?.fname;
    let lname = req.query?.lname;
    let handed = req.query?.handed;
    let balance = req.query.initial_balance_usd;
    let handed_arr = ["left", "right", "ambi"];
    let error = false;
    let error_string = "invalid fields ";

    
    if (fname!= undefined) {
        if (!(players._isCharacter(fname))) {
            error = true;
            error_string += "fname";
        }
    }
    else {
        error = true;
        error_string += "fname";
    }
    if (lname) {
        if (!(players._isCharacter(lname))) {
            error = true;
            error_string += "lname";
        }
    }
    else if (lname == undefined) {
        error = true;
        error_string += "lname";
    }

    if (!(handed_arr.includes(handed.toLowerCase()))) {
        error = true;
        error_string += "handed";
    }
    if ((isNaN(Number(balance))) || (Number(balance) < 0) || (Number(balance) != Number(balance).toFixed(2))) {
        error = true;
        error_string += "initial_balance_usd";
    }

    if (!error) {
        let balance_num = Number(balance).toFixed(2);
        players.createPlayer(fname, lname, handed, balance_num, (err, data) => {
            if(!err){
                res.redirect(303, `/player/${data}`)
            }
        })
    }
    else {
        res.status(422).send(error_string);
    }
})


app.post('/player/:pid', (req, res) => {
    let players = new PlayerSourceJson(mcf);
    let lname = req.query?.lname;
    let active = req.query?.active;
    let error = false;

    if (lname && (!players._isCharacter(lname))) {
        error = true;
    }

    if (active != undefined) {
        if ((active == '1') || active.toLowerCase() == 't' || active.toLowerCase() == 'true') {
            active = true
        }
        else {
            active = false;
        }
    }
    else {
        active = null;
    }

    if(!error) {
        players.updatePlayer(req.params.pid, lname, active, (err, data) => {
            if(!err){
                res.redirect(303, `/player/${req.params.pid}`);
            }
            else{
                res.sendStatus(404);
            }
        })
    }
    else{
        res.sendStatus(422);
    }
})
        

app.delete('/player/:pid', (req, res) => {
    let players = new PlayerSourceJson(mcf);
    players.deletePlayer(req.params.pid, (err, data) => {
        if(!err){
            res.redirect(303, '/player')
        }
        else{
            res.sendStatus(404);
        }
    });
})

app.post('/deposit/player/:pid', (req, res) => {
    let players = new PlayerSourceJson(mcf);
    let deposit = req.query?.amount_usd;

    if ((isNaN(Number(deposit))) || (Number(deposit) < 0) || (Number(deposit) != Number(deposit).toFixed(2))) {
        res.sendStatus(400);
        return;
    }

    players.getBalance(req.params.pid, Number(deposit), (err, data) => {
        if(!err){
            res.status(200).send(JSON.stringify(data));
        }
        else{
            res.sendStatus(404);
        }
    })
})

if(!config_check(mcf)){
    process.exit(2);
}
app.listen(3000);
