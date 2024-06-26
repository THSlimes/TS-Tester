import Test from "../../../src/lib/Test";

export const test1 = new Test("Containment assertions", expect => {
    expect([1, 2, 3]).named().toContain(1);
    expect([1, 2, 3]).named().toContainAllOf(3, 2, 1, 3);
    expect([1, 2, 3]).named().toContainSomeOf(4, 6, 2, 5, 2);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).named().toContainSequence([5, 6, 7]);
});

export const test2 = new Test("Assertions on elements", expect => {
    expect([1, 2, 3]).named().forAllElements(e => e.named().toBeAtMost(3));
    expect([1, 2, 3]).named().forSomeElements(e => e.named().toBeGreaterThan(2));
});

export const test3 = new Test("Other assertions", expect => {
    expect([1, 2, 3]).named().toBeOfLength(3);
});