const mysql = require('mysql2/promise');
mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'}).then(c => {
  c.query("UPDATE selling_platforms SET name = 'GeM' WHERE name = 'Gem'").then(([res]) => {
    console.log(res);
    c.end();
  });
});
