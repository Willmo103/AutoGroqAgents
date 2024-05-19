const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const AdmZip = require('adm-zip');
const moment = require('moment');
const { spawn } = require('child_process');
const winston = require('winston');

const workflowsDir = path.join(__dirname, 'workflows');
const archiveDir = path.join(workflowsDir, 'archive');
const zipArchiveDir = path.join(__dirname, 'zipArchive');
const readmePath = path.join(__dirname, 'README.md');
const logFilePath = path.join(__dirname, 'app.log');

// Create necessary directories if they don't exist
if (!fs.existsSync(workflowsDir)) {
    fs.mkdirSync(workflowsDir);
}
if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir);
}
if (!fs.existsSync(zipArchiveDir)) {
    fs.mkdirSync(zipArchiveDir);
}

// Configure Winston logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `[${timestamp}] ${level}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: logFilePath }),
    ],
});

// Watch for new .zip files in the current directory
const watcher = chokidar.watch('*.zip', {
    cwd: __dirname,
    persistent: true,
    ignoreInitial: true,
});

watcher.on('add', (zipFile) => {
    if (!zipFile.endsWith('.zip')) {
        logger.info(`Ignoring non-zip file: ${zipFile}`);
        return;
    } else {
        try {

            const zipFilePath = path.join(__dirname, zipFile);
            const folderName = path.parse(zipFile).name;
            const folderPath = path.join(workflowsDir, folderName);
            const timestamp = moment().format('HHmmDDMM');

            // Check if the folder already exists
            if (fs.existsSync(folderPath)) {
                const archivedFolderName = `${folderName}_${timestamp}`;
                const archivedFolderPath = path.join(archiveDir, archivedFolderName);
                fs.renameSync(folderPath, archivedFolderPath);
                logger.info(`Moved existing folder to archive: ${archivedFolderName}`);
            }

            // Create the new folder
            fs.mkdirSync(folderPath);

            // Unzip the contents into the new folder
            const zip = new AdmZip(zipFilePath);
            zip.extractAllTo(folderPath, true);

            // Move the original .zip file to the zipArchive folder
            const zipArchivePath = path.join(zipArchiveDir, zipFile);
            fs.renameSync(zipFilePath, zipArchivePath);

            // Update README.md with the current timestamp and folder name
            const readmeContent = `# Latest Workflow\n\nFolder: ${folderName}\nTimestamp: ${timestamp}\n`;
            fs.writeFileSync(readmePath, readmeContent);

            // Run git commands as a child process
            const gitCommitMessage = `added new workflow ${folderName} ${timestamp}`;
            const gitCommands = ['C:\\Program Files\\Git\\cmd\\git.exe', ['add', '.'], ['commit', '-a', '-m', gitCommitMessage]];

            gitCommands.forEach((command) => {
                const [cmd, ...args] = command;
                const git = spawn(cmd, args);

                git.stdout.on('data', (data) => {
                    logger.info(`git stdout: ${data}`);
                });

                git.stderr.on('data', (data) => {
                    logger.error(`git stderr: ${data}`);
                });

                git.on('close', (code) => {
                    logger.info(`git process exited with code ${code}`);
                });
            });

            logger.info(`Processed ${zipFile}`);
        } catch (err) {
            logger.error(`Error processing ${zipFile}: ${err.message}`);
        }
    }
});

logger.info('Watching for new .zip files...');
