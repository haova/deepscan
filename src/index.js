import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { all, concat, equals, mergeWith } from 'ramda';
import colors from 'colors';
import { rimraf } from 'rimraf';

const mode = process.argv[2];
const drives = process.argv.slice(3);

function hiddenEntry(name) {
  if (name[0] === '.') return false;

  if (name[0] === '$') return false;

  if (name === 'System Volume Information') return false;

  return true;
}

function scanDir(entry) {
  if (!existsSync(entry)) return [];

  if (statSync(entry).isFile()) return [];

  return readdirSync(entry).filter(hiddenEntry);
}

function scanDrive(drive) {
  const agentList = scanDir(drive);

  let agents = {};
  for (const agent of agentList) {
    let projects = {};

    const agentPath = join(drive, agent);
    const categories = scanDir(agentPath);
    for (const category of categories) {
      const projectList = scanDir(join(agentPath, category)).map((project) => {
        const path = join(agentPath, category, project);
        const stat = statSync(path);
        return {
          [project]: [
            {
              drive,
              agent,
              category,
              project,
              path: path,
              file: stat.isFile(),
              size: stat.size,
            },
          ],
        };
      });

      if (projectList.length === 0) continue;

      for (const project of projectList)
        projects = mergeWith(concat, projects, project);
    }

    agents[agent] = projects;

    if (Object.keys(projects).length === 0) {
      rimraf.sync(agentPath);
      console.log(colors.red(`[EMP][A] ${agentPath}`));
    }
  }

  return agents;
}

function reportDrives() {
  let report = {};
  for (const drive of drives) {
    const driveReport = scanDrive(drive);

    for (const agent in driveReport) {
      report[agent] ||= {};
      report[agent] = mergeWith(concat, report[agent], driveReport[agent]);
    }
  }
  return report;
}

// find duplicates
if (mode === 'dup') {
  const report = reportDrives(drives);

  for (const agent in report) {
    for (const project in report[agent]) {
      const entries = report[agent][project];

      const allFile = entries.every((entry) => entry.file);

      if (
        entries.length > 1 &&
        allFile &&
        all(equals(entries[0].size))(entries.map((entry) => entry.size))
      ) {
        const entryLabels = entries.map((item) => item.path);
        for (let i = 0; i < entryLabels.length - 1; i++) {
          rimraf.sync(entryLabels[i]);
          entryLabels[i] = colors.red(entryLabels[i]);
        }

        entryLabels[entryLabels.length - 1] = colors.green(
          entryLabels[entryLabels.length - 1]
        );

        console.log(`[DUP][A] ${entryLabels.join(' vs ')}`);
      } else if (entries.length > 1) {
        console.log(
          colors.cyan(
            `[DUP][M] ${entries.map((item) => item.path).join(' vs ')}`
          )
        );
      }
    }
  }
}
