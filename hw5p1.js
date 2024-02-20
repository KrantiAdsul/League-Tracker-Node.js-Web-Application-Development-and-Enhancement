const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const express = require('express');
const app = express();
const mcf = './config/mongo.json';
const bodyParser = require('body-parser');
const path = require('path');

app.use(bodyParser.urlencoded({ extended: false }));

function config_check(configfile) {
  try {
    JSON.parse(fs.readFileSync(configfile));
  } catch {
    return false;
  }
  return true;
}

class PlayerSourceJson {
  constructor(file) {
    this.config = {};
    this.collection = 'player';
    try {
      this.config = require(file);
    } catch {
      this.config = {
        host: 'localhost',
        port: '27017',
        db: 'ee547_hw',
        opts: {
          useUnifiedTopology: true,
        },
      };
    }

    this.uri = `mongodb://${this.config.host}:${this.config.port}`;
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
                        
			}else{
                            connection.close();
                            callback(true, null);
                        }
                    
		    }else{
                        connection.close();
                        callback(err, null);
                    }
                })
            
	    }else{
                process.exit(5);
            }
        })
    }

    createPlayer(fname, lname, handed, balance_initial_cents, callback) {
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
                        balance_usd_cents: balance_initial_cents,
                        created_at: new Date()
                    };
                    data_b.collection(this.collection).insertOne(player_dict, (err, data) => {
                        if(!err) {
                            connection.close();
                            callback(null, data.insertedId);
                        
			}else{
                            connection.close();
                            callback(err, null);
                        }
                    })
                })
            
	    }else{
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
getBalance(pid, balance_new_cents, callback) {
    this.client.connect(async (err, connection) => {
        if (!err) {
            let data_b = this.client.db(this.config.db);

            let player = await data_b.collection(this.collection).findOne({ _id: ObjectId(pid) });

            if (player) {
                let return_dict = {
                    'old_balance_usd_cents': player?.balance_usd_cents,
                    'new_balance_usd_cents': null
                }

                let update_dict = { $set: {} };

                // Original code
                if (balance_new_cents != null) {
                    const newBalance = Number(player?.balance_usd_cents) + (balance_new_cents > 0 ? balance_new_cents : 0);
                    // Convert newBalance to a number
                    update_dict.$set.balance_usd_cents = newBalance;
                    return_dict.new_balance_usd_cents = update_dict.$set.balance_usd_cents;
                }

                data_b.collection(this.collection).updateOne({ _id: ObjectId(pid) }, update_dict, (err, data) => {
                    if (!err) {
                        if (data.matchedCount > 0) {
                            connection.close();
                            callback(null, return_dict);
                        }
                        else {
                            connection.close();
                            callback(true, null);
                        }
                    }
                    else {
                        connection.close();
                        callback(err, null);
                    }
                });
            }
            else {
                connection.close();
                callback(true, null);
            }
        }
        else {
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
            balance_usd_cents: player.balance_usd_cents
        };

        return dict;
    }

    _isCharacter(char) {
        return typeof char === "string" && (/^[a-zA-Z]+$/).test(char);
    }

    renderPlayersPage(req, res) {
        let players = new PlayerSourceJson(mcf);
        players.getPlayers((err, data) => {
          if (!err) {
            res.render('players.ejs', { players: data });
          }
        });
      }
    
      renderCreatePlayerPage(req, res) {
        res.sendFile(path.join(__dirname, 'public', 'player', 'create.html'));
      }
    
      renderEditPlayerPage(req, res) {
        const playerId = req.params.id;
        let players = new PlayerSourceJson(mcf);
        players.getPlayer(playerId, (err, data) => {
          if (!err) {
            res.render('editPlayer.ejs', { player: data });
          } else {
            res.sendStatus(404);
          }
        });
      }
    
      createPlayer(req, res) {
        const { fname, lname, handed, initial_balance_usd } = req.body;
        let players = new PlayerSourceJson(mcf);
    
        // Validate the request data
        if (!fname || !lname || !handed || !initial_balance_usd) {
          res.sendStatus(400); // Bad Request
          return;
        }
    
        // Handle player creation
        players.createPlayer(fname, lname, handed, initial_balance_usd, (err, data) => {
          if (!err) {
            res.redirect('/players.html');
          } else {
            res.sendStatus(500); // Internal Server Error
          }
        });
      }
    
      editPlayer(req, res) {
        const playerId = req.params.id;
        const { lname, active } = req.body;
        let players = new PlayerSourceJson(mcf);
    
        // Handle player editing
        players.updatePlayer(playerId, lname, active, (err, data) => {
          if (!err) {
            res.redirect(`/player/${playerId}/edit.html`);
          } else {
            res.sendStatus(500); // Internal Server Error
          }
        });
      }
}
// Endpoint for checking if the server is running
app.get('/ping', (req, res) => {
    res.sendStatus(204);
  });
  
  // Creating an instance of PlayerSourceJson
  const players = new PlayerSourceJson(mcf);
  
  // Route for rendering the players list
  app.get('/players.html', (req, res) => {
    players.renderPlayersPage(req, res);
  });
  
  // Route for rendering the player creation form
  app.get('/player/create.html', (req, res) => {
    players.renderCreatePlayerPage(req, res);
  });
  
  // Route for rendering the player editing form
  app.get('/player/:id/edit.html', (req, res) => {
    players.renderEditPlayerPage(req, res);
  });
  
  // Route for creating a player
  app.post('/api/player', (req, res) => {
    players.createPlayer(req, res);
  });
  
  // Route for editing a player
  app.post('/api/player/:id', (req, res) => {
    players.editPlayer(req, res);
  });
  
  // Start the server
  app.listen(3000, () => {
    console.log('Server is running on port 3000');
  });