const mysql = require('mysql2/promise');

async function r() { 
  const s = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'}); 
  const [stables] = await s.query("SHOW TABLES LIKE '%order%'"); 
  console.log('imnew:', stables); 
  
  const d = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'}); 
  const [dtables] = await d.query("SHOW TABLES LIKE '%order%'"); 
  console.log('newdb:', dtables); 
  
  s.end(); 
  d.end(); 
} 
r();
