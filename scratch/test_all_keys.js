const { Key } = require("@nut-tree-fork/nut-js");

const testKeys = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  'Num0', 'Num1', 'Num2', 'Num3', 'Num4', 'Num5', 'Num6', 'Num7', 'Num8', 'Num9',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'Enter', 'Escape', 'Space', 'Backspace', 'Tab',
  'LeftShift', 'RightShift', 'LeftControl', 'RightControl', 'LeftAlt', 'RightAlt', 'LeftSuper', 'RightSuper',
  'Left', 'Up', 'Right', 'Down',
  'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
  'CapsLock', 'ScrollLock', 'NumLock',
  'Semicolon', 'Equal', 'Comma', 'Minus', 'Period', 'Slash',
  'Grave', 'LeftBracket', 'Backslash', 'RightBracket', 'Quote'
];

for (const k of testKeys) {
  if (Key[k] === undefined) {
    console.error(`Key.${k} is UNDEFINED!`);
  } else {
    console.log(`Key.${k} = ${Key[k]}`);
  }
}
