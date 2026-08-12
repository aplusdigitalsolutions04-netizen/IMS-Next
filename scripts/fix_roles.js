const mysql = require('mysql2/promise');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

async function fixRoles() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});
  try {
    const roles = ['Admin', 'Accountant', 'SuperAdmin', 'User', 'Supervisor'];
    for (const role of roles) {
      const guid = uuidv4();
      // Insert role
      await c.query(`
        INSERT INTO roles (guid, name, baseTier, permissions, editPermissions, isBaseTier, createdAt)
        VALUES (?, ?, ?, '[]', '[]', 1, NOW())
      `, [guid, role, role]);
      
      // Assign roleId to users who have this role string
      await c.query(`
        UPDATE users SET roleId = ? WHERE role = ?
      `, [guid, role]);
    }
    console.log('Roles created and users updated successfully!');
  } catch (err) {
    console.error(err);
  } finally {
    c.end();
  }
}
fixRoles();
