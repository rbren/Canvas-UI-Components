const keys = new WeakMap<object, number>();
let nextKey = 0;

export function scopeKey(owner: object): number {
  let key = keys.get(owner);
  if (key === undefined) {
    key = ++nextKey;
    keys.set(owner, key);
  }
  return key;
}
