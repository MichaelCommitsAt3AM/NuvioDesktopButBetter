import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

const windows = process.platform === 'win32';
const root = fileURLToPath(new URL('../../', import.meta.url));
const staged = path.join(root, 'desktop-ui/src-tauri/resources/backend/runtime');
let temporary, classes, launcher;

before(() => {
  if (!windows) return;
  temporary = mkdtempSync(path.join(tmpdir(), 'Nuvio launcher 日本語 '));
  classes = path.join(temporary, 'probe classes');
  mkdirSync(classes);
  const runtime = path.join(temporary, 'runtime');
  if (process.env.NUVIO_LAUNCHER_TEST_RUNTIME) {
    cpSync(process.env.NUVIO_LAUNCHER_TEST_RUNTIME, runtime, { recursive: true });
    cpSync(path.join(staged, 'bin/Nuvio.exe'), path.join(runtime, 'bin/Nuvio.exe'));
  } else {
    symlinkSync(staged, runtime, 'junction');
  }
  launcher = path.join(runtime, 'bin/Nuvio.exe');
  assert.ok(existsSync(launcher), 'Bundle Java and build the launcher before testing');
  assert.ok(existsSync(path.join(runtime, 'bin/server/jvm.dll')), 'Test runtime must contain server/jvm.dll');
  writeFileSync(path.join(classes, 'Probe.java'), `
import java.io.*;
import java.nio.charset.StandardCharsets;
public class Probe {
  public static void main(String[] args) throws Exception {
    java.awt.Frame frame = new java.awt.Frame();
    frame.dispose();
    System.out.println("READY:" + System.getProperty("probe", "unset"));
    System.out.flush();
    String line = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8)).readLine();
    if ("exit".equals(line)) System.exit(23);
    if ("throw".equals(line)) throw new IllegalStateException("probe failure");
    Runtime.getRuntime().addShutdownHook(new Thread(() -> System.err.println("SHUTDOWN")));
    Thread worker = new Thread(() -> {
      try { Thread.sleep(100); } catch (InterruptedException error) { throw new RuntimeException(error); }
      System.out.println("WORKER:" + line);
    });
    worker.start();
  }
}`);
  const compiler = path.join(process.env.JAVA_HOME, 'bin/javac.exe');
  const compiled = spawnSync(compiler, ['--release', '17', '-d', '.', 'Probe.java'], { cwd: classes, encoding: 'utf8' });
  assert.equal(compiled.status, 0, compiled.stderr);
});

after(() => { if (temporary) rmSync(temporary, { recursive: true, force: true }); });

function run(input, extra = []) {
  return spawnSync(launcher, ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-Dprobe=日本語', ...extra, '-cp', classes, 'Probe'], {
    input, encoding: 'utf8', timeout: 15000, windowsHide: true,
  });
}

test('JVM runs inside branded Nuvio.exe, without a Java child or console', { skip: !windows, timeout: 20000 }, async () => {
  const child = spawn(launcher, ['-cp', classes, 'Probe'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  try {
    await Promise.race([once(child.stdout, 'data'), exited.then(([code]) => { throw new Error(`Launcher exited before READY (${code}): ${errors}`); })]);
    const inspected = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
      $p = Get-CimInstance Win32_Process -Filter 'ProcessId=${child.pid}';
      $children = @(Get-CimInstance Win32_Process -Filter 'ParentProcessId=${child.pid}');
      [pscustomobject]@{name=$p.Name; children=$children.Count; description=(Get-Item -LiteralPath $p.ExecutablePath).VersionInfo.FileDescription; window=(Get-Process -Id ${child.pid}).MainWindowHandle.ToInt64()} | ConvertTo-Json -Compress
    `], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.deepEqual(JSON.parse(inspected.stdout), { name: 'Nuvio.exe', children: 0, description: 'Nuvio', window: 0 });
    child.stdin.end('done\n');
    assert.deepEqual(await exited, [0, null]);
  } finally {
    if (child.exitCode === null) { child.kill(); await exited; }
  }
});

test('Unicode paths/options, pipes, non-daemon lifetime and shutdown hooks survive hosting', { skip: !windows }, () => {
  const result = run('hello\n');
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  assert.match(result.stdout, /READY:日本語/);
  assert.match(result.stdout, /WORKER:hello/);
  assert.match(result.stderr, /SHUTDOWN/);
});

test('System.exit and uncaught Java exceptions preserve failure status', { skip: !windows }, () => {
  assert.equal(run('exit\n').status, 23);
  const failure = run('throw\n');
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /IllegalStateException: probe failure/);
});

test('invalid VM options and missing main classes fail rather than silently starting', { skip: !windows }, () => {
  assert.notEqual(run('', ['-XX:NotARealNuvioOption']).status, 0);
  const missing = spawnSync(launcher, ['-cp', classes, 'MissingClass'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /NoClassDefFoundError/);
});

test('missing private JVM fails without falling back to installed Java', { skip: !windows }, () => {
  const isolated = path.join(temporary, 'isolated');
  mkdirSync(isolated);
  mkdirSync(path.join(isolated, 'server'));
  const exe = path.join(isolated, 'Nuvio.exe');
  cpSync(launcher, exe);
  const result = spawnSync(exe, ['-cp', classes, 'Probe'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot load bundled/);
});
