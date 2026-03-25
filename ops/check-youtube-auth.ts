import { existsSync, readFileSync } from 'fs';

console.log('Checking YouTube authentication...\n');

const channelsPath = 'youtube-channels.json';

if (existsSync(channelsPath)) {
  const data = JSON.parse(readFileSync(channelsPath, 'utf-8'));
  const count = data.channels ? data.channels.length : 0;
  console.log('Found ' + count + ' channels in config\n');

  if (data.channels) {
    data.channels.forEach((ch) => {
      console.log('Channel:', ch.name);
      console.log('  ID:', ch.id);
      console.log('  Authenticated:', ch.isAuthenticated ? 'YES' : 'NO');
      console.log('  Has tokens:', ch.accessToken && ch.refreshToken ? 'YES' : 'NO');
      console.log('');
    });
  }

  const auth = data.channels
    ? data.channels.filter((ch) => ch.isAuthenticated && ch.accessToken && ch.refreshToken)
    : [];
  console.log(auth.length + ' authenticated channels ready for upload');
} else {
  console.log('No youtube-channels.json file found');
}
