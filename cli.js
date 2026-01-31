#!/usr/bin/env node
import fetch from 'node-fetch';

const [,, command, ...args] = process.argv;

if (command === 'save') {
  const content = args.join(' ');
  await fetch('http://localhost:3000/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'cli', title: 'CLI Save', content })
  });
  console.log('Saved!');
}
