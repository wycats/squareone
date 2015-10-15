class Person {
  private first: string;
  private last: string;

  constructor(first: string, last: string) {
    this.first = first;
    this.last = last;
  }

  get fullName() {
    return `${this.first} ${this.last}`;
  }
}

export { Person };