#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PKG_DIR = path.resolve(__dirname, '..');

program
  .name('openclaw')
  .description('AI-powered pod hive dashboard — real-time microservice monitoring with Hermes integration')
  .version(require('../package.json').version);

program
  .command('install')
  .description('Install openclaw dependencies')
  .action(() => {
    console.log('Installing openclaw dependencies...');
    execSync('npm install', { cwd: PKG_DIR, stdio: 'inherit' });
    console.log('Done.');
  });

program
  .command('build')
  .description('Validate environment and prepare openclaw for deployment')
  .action(() => {
    console.log('\nopenclaw build check\n');
    const checks = [
      { label: 'ANTHROPIC_API_KEY', value: process.env.ANTHROPIC_API_KEY, required: false },
      { label: 'HERMES_URL', value: process.env.HERMES_URL, required: false },
      { label: 'PORT', value: process.env.PORT || '3000 (default)', required: false },
    ];
    checks.forEach(({ label, value }) => {
      const status = value ? '✓' : '○';
      const display = value ? (label.includes('KEY') ? '[set]' : value) : 'not set';
      console.log(`  ${status}  ${label.padEnd(20)} ${display}`);
    });
    console.log('\nNote: ANTHROPIC_API_KEY is used when HERMES_URL is not set (standalone mode).');
    console.log('Build ready. Run `openclaw deploy` to start the server.\n');
  });

program
  .command('deploy')
  .description('Start the openclaw dashboard server')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .action((opts) => {
    process.env.PORT = process.env.PORT || opts.port;
    console.log(`\nStarting openclaw on port ${process.env.PORT}...`);
    const server = spawn('node', [path.join(PKG_DIR, 'src/server.js')], {
      cwd: PKG_DIR,
      stdio: 'inherit',
      env: process.env,
    });
    server.on('error', (err) => {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    });
    process.on('SIGINT', () => { server.kill(); process.exit(0); });
    process.on('SIGTERM', () => { server.kill(); process.exit(0); });
  });

program
  .command('pull')
  .description('Pull latest openclaw updates from origin')
  .action(() => {
    console.log('Pulling latest changes...');
    try {
      execSync('git pull origin main', { cwd: PKG_DIR, stdio: 'inherit' });
    } catch {
      execSync('git pull', { cwd: PKG_DIR, stdio: 'inherit' });
    }
    console.log('Done.');
  });

program
  .command('download')
  .description('Download openclaw to a local directory')
  .option('-o, --output <dir>', 'Output directory', './openclaw-local')
  .action((opts) => {
    const dest = path.resolve(process.cwd(), opts.output);
    console.log(`Downloading openclaw to ${dest}...`);
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const excludes = ['node_modules', '.git', 'data'];
    copyDir(PKG_DIR, dest, excludes);
    console.log('Done.');
  });

function copyDir(src, dest, excludes = []) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (excludes.includes(entry)) continue;
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath, excludes);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

program.parse();
