'use strict';

const fs = require('fs');
const express = require('express');
const data_dir = './data';
const app = express();

let global_pid = 1; 

const handedresponse_enum = {
    L: 'left',
    R: 'right',
    A: 'ambi'
};

const handedfile_enum = {
    left: 'L',
    right: 'R',
    ambi: 'A'
};

class PlayerSourceJSON {
    constructor(file) {
        this.file = file;
        let date = new Date();
        this.data = { players: [], updated_at: date, created_at: date, version: '1.0' };
      
        if (!(fs.existsSync(data_dir))) {
          fs.mkdirSync(data_dir);
        }
      
        if (!(fs.existsSync(file))) {
          fs.writeFileSync(file, JSON.stringify(this.data));
        } else {
          this.data = JSON.parse(fs.readFileSync(file));
        }
    }      

    getPlayer(pid) {
        let player_Index = this.data.players.findIndex((obj => obj.pid == pid));
      
        if (player_Index < 0) {
          return this._formatPlayer(null);
        } else {
          let player = this.data.players[player_Index];
          return this._formatPlayer(player);
        }
    }      

    createPlayer(fname, lname, handed, balance_initial) {
        let playerinfo = {};
        playerinfo['pid'] = global_pid;
        global_pid++;
        playerinfo['fname'] = fname;
        playerinfo['lname'] = lname ? lname : '';
        playerinfo['handed'] = enum_handed_file[handed.toLowerCase()];
        playerinfo['is_active'] = true;
        playerinfo['balance_usd'] = balance_initial;
        this.data.players.push(playerinfo);
        this._update(this.data);
        return (global_pid - 1);
    }

    updatePlayer(pid, newLname, newActive, balanceChange) {
        const playerIndex = this.data.players.findIndex((obj) => obj.pid == pid);
      
        if (playerIndex >= 0) {
          this.data.players[playerIndex].lname = ((newLname == null) ? this.data.players[playerIndex].lname : newLname);
          this.data.players[playerIndex].is_active = ((newActive == null) ? this.data.players[playerIndex].is_active : newActive);
          let balanceNum = Number(this.data.players[playerIndex].balance_usd);
          balanceNum += (balanceChange > 0) ? balanceChange : 0;
          this.data.players[playerIndex].balance_usd = balanceNum.toFixed(2);
          this._update(this.data);
          return pid;
        } else {
          return null;
        }
    }

    
    deletePlayer(pid) {
        const player_Index = this.data.players.findIndex((obj) => obj.pid == pid);
        if (player_Index >= 0) {
          this.data.players.splice(player_Index, 1);
          this._update(this.data);
        }
        return player_Index >= 0 ? pid : null;
    }      

    getBalance(pid) {
        const player = this.data.players.find((obj) => obj.pid == pid);
        if (player) {
          return player.balance_usd;
        }
        return '0.00'; // Return a string representing zero balance with two decimal places.
      }      

    getPlayers() {
        return this.data.players
          .map(this._formatPlayer)
          .sort((a, b) => a.name.localeCompare(b.name));
      }      

    _formatPlayer(player) {
        if (!player) return null;
        if (Array.isArray(player)) return player.map(this._formatPlayer);
        const { pid, fname, lname, handed, is_active, balance_usd } = player;
        return { pid, name: `${fname}${lname ? ` ${lname}` : ''}`, handed: enum_handed_response[handed], is_active, balance_usd };
    }
           
    _update(data) {
        data.updated_at = new Date().toISOString();
        fs.writeFileSync(this.file, JSON.stringify(data), { encoding: 'utf8', flag: 'w' });
    }  

    _isCharacter(char) {
        return typeof char === "string" && (/^[a-zA-Z]+$/).test(char);
    }
}

app.get('/ping', (req, res) => {
    res.sendStatus(204);
});

app.get('/player', (req, res) => {
    let players = new PlayerSourceJSON('./data/player.json');
    let player_array = players.getPlayers();
    res.status(200).send(JSON.stringify(player_array));
})

app.get('/player/:pid', (req, res) => {
    const players = new PlayerSourceJSON('./data/player.json');
    const player = players.getPlayer(req.params.pid);
    return player
        ? res.status(200).send(JSON.stringify(player))
        : res.sendStatus(404);
});

app.delete('/player/:pid', (req, res) => {
    const players = new PlayerSourceJSON('./data/player.json');
    const ret = players.deletePlayer(req.params.pid);
    return ret
        ? res.redirect(303, '/player')
        : res.sendStatus(404);
});

app.post('/player', (req, res) => {
    let players = new PlayerSourceJSON('./data/player.json');
    let fname = req.query?.fname;
    let lname = req.query?.lname;
    let handed = req.query?.handed;
    let balance = req.query.initial_balance_usd;
    let handed_arr = ["left", "right", "ambi"];
    let error = false;
    let error_string = "invalid fields ";
    if (!fname || !players._isCharacter(fname)) {
        error = true;
        error_string += "fname";
    }
    if (!lname || !players._isCharacter(lname)) {
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
        const balance_num = Number(balance).toFixed(2);
        const id = players.createPlayer(fname, lname, handed, balance_num);
        res.redirect(303, `/player/${id}`);
    } else {
        res.status(422).send(error_string);
    }
})

app.post('/player/:pid', (req, res) => {
    let players = new PlayerSourceJSON('./data/player.json');
    let lname = req.query?.lname;
    let active = req.query?.active;
    let error = false;

    if (lname && (!players._isCharacter(lname))) {
        error = true;
    }

    active = (active != undefined) ? (active == '1' || active.toLowerCase() == 't' || active.toLowerCase() == 'true') : null;

    if (!error) {
        const id = players.updatePlayer(req.params.pid, lname, active, null);
        return id ? res.redirect(303, `/player/${id}`) : res.sendStatus(404);
    } else {
        return res.sendStatus(422);
    }    
})

app.post('/deposit/player/:pid', (req, res) => {
    let players = new PlayerSourceJSON('./data/player.json');
    let deposit = req.query?.amount_usd;
    let error = false;
    if (deposit != undefined) {
        if ((isNaN(Number(deposit))) || (Number(deposit) < 0) || (Number(deposit) != Number(deposit).toFixed(2))) {
            error = true;
        }
    }
    else {
        error = true;
    }

    if (!error) {
        let old_bal = players.getPlayer(req.params.pid);
        let id = players.updatePlayer(req.params.pid, null, null, Number(deposit));
        if (id) {
            let new_bal = players.getPlayer(id);
            let player_balance = {
                old_balance_usd: old_bal.balance_usd,
                new_balance_usd: new_bal.balance_usd
            }
            res.status(200).send(JSON.stringify(player_balance));
        }
        else {
            res.sendStatus(404);
        }
    }
    else {
        res.sendStatus(400);
    }   
})
const { PORT = 3000 } = process.env;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

