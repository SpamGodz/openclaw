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
      { label: 'ANTHROPIC_API_KEY', value: process.env.ANTHROPIC_API_KEY },
      { label: 'HERMES_URL', value: process.env.HERMES_URL },
      { label: 'HERMES_PATH', value: process.env.HERMES_PATH },
      { label: 'HERMES_MODEL', value: process.env.HERMES_MODEL },
      { label: 'HERMES_BRIDGE_PORT', value: process.env.HERMES_BRIDGE_PORT },
      { label: 'PORT', value: process.env.PORT || '3000 (default)' },
    ];
    checks.forEach(({ label, value }) => {
      const status = value ? '✓' : '○';
      const display = value ? (label.includes('KEY') ? '[set]' : value) : 'not set';
      console.log(`  ${status}  ${label.padEnd(22)} ${display}`);
    });
    console.log('\nHermes mode:  set HERMES_URL + HERMES_PATH, run `openclaw hermes-bridge`');
    console.log('Claude mode:  set ANTHROPIC_API_KEY only (no Hermes needed)');
    console.log('\nRun `openclaw deploy` to start the dashboard server.\n');
  });

program
  .command('hermes-setup')
  .description('Clone and install Hermes Agent (NousResearch/hermes-agent)')
  .option('--path <dir>', 'Install Hermes to this directory', process.env.HERMES_PATH || `${process.env.HOME}/.hermes-agent`)
  .action((opts) => {
    process.env.HERMES_PATH = opts.path;
    const script = path.join(PKG_DIR, 'scripts/hermes-setup.sh');
    console.log(`\nRunning Hermes setup (target: ${opts.path})...\n`);
    try {
      execSync(`bash "${script}"`, { stdio: 'inherit', env: { ...process.env, HERMES_PATH: opts.path } });
    } catch (err) {
      console.error('\nSetup failed. Check output above for details.');
      process.exit(1);
    }
  });

program
  .command('hermes-bridge')
  .description('Start the Hermes HTTP bridge (exposes Hermes Agent as REST API for openclaw)')
  .option('-p, --port <port>', 'Bridge port', process.env.HERMES_BRIDGE_PORT || '8000')
  .option('--hermes-path <dir>', 'Path to hermes-agent clone', process.env.HERMES_PATH || `${process.env.HOME}/.hermes-agent`)
  .action((opts) => {
    const bridgeScript = path.join(PKG_DIR, 'scripts/hermes-http-bridge.py');
    const python = findPython();
    if (!python) {
      console.error('Python 3 not found. Install Python 3.11+ and try again.');
      process.exit(1);
    }
    const env = {
      ...process.env,
      HERMES_BRIDGE_PORT: opts.port,
      HERMES_PATH: opts.hermesPath,
    };
    console.log(`\nStarting Hermes bridge on port ${opts.port} ...`);
    console.log(`Using Python: ${python}`);
    console.log(`Hermes path:  ${opts.hermesPath}\n`);
    const bridge = spawn(python, [bridgeScript], { stdio: 'inherit', env });
    bridge.on('error', (err) => { console.error('Bridge error:', err.message); process.exit(1); });
    process.on('SIGINT', () => { bridge.kill(); process.exit(0); });
    process.on('SIGTERM', () => { bridge.kill(); process.exit(0); });
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

function findPython() {
  for (const cmd of ['python3', 'python']) {
    try {
      const ver = execSync(`${cmd} --version 2>&1`, { encoding: 'utf8' }).trim();
      if (ver.includes('Python 3')) return cmd;
    } catch { /* not found */ }
  }
  return null;
}

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
