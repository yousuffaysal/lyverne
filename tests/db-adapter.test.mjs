import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toPositional} from '../server/db.mjs';

test('numbers placeholders in order', () => {
  assert.equal(
    toPositional('SELECT * FROM orders WHERE customer_id=? AND request_key=?'),
    'SELECT * FROM orders WHERE customer_id=$1 AND request_key=$2',
  );
});

test('leaves SQL without placeholders untouched', () => {
  const sql = "SELECT * FROM shop_settings WHERE id='opening-promotion'";
  assert.equal(toPositional(sql), sql);
});

test('does not treat a ? inside a string literal as a placeholder', () => {
  assert.equal(
    toPositional("UPDATE products SET name=? WHERE description='what? yes'"),
    "UPDATE products SET name=$1 WHERE description='what? yes'",
  );
});

test('handles doubled quotes escaping inside a literal', () => {
  assert.equal(
    toPositional("SELECT * FROM products WHERE name='it''s ok? no' AND id=?"),
    "SELECT * FROM products WHERE name='it''s ok? no' AND id=$1",
  );
});

test('handles double-quoted identifiers', () => {
  assert.equal(
    toPositional('SELECT "weird?column" FROM products WHERE id=?'),
    'SELECT "weird?column" FROM products WHERE id=$1',
  );
});

test('numbers every placeholder in the order-creation guard', () => {
  const sql = "(SELECT COUNT(*) FROM products WHERE id=? AND stock>=? AND status='active' AND version=?)=1";
  assert.equal(
    toPositional(sql),
    "(SELECT COUNT(*) FROM products WHERE id=$1 AND stock>=$2 AND status='active' AND version=$3)=1",
  );
});

test('counts placeholders correctly in a long batch statement', () => {
  const sql = 'INSERT INTO products(id,name,color,description,category,price,stock,sizes,image,back,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)';
  const out = toPositional(sql);
  assert.match(out, /VALUES\(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9,\$10,\$11,\$12,\$13\)/);
  assert.equal(out.match(/\$\d+/g).length, 13);
});
