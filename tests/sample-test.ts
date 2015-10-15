import { Person } from 'person';

test("hello", assert => {
  assert.equal(2, 1 + 1, "math works");
  assert.ok(true, "okey doke");
});

test("good times", assert => {
  let person = new Person("Leah", "Silber");
  assert.equal(person.fullName, "Leah Silber", "full name works");
});