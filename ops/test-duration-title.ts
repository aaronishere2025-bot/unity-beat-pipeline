const jobId = '77da3ada-3014-4e8b-8007-eb46c19c8458';

console.log('Testing duration-based title adjustment...\n');

const response = await fetch('http://localhost:8080/api/youtube/generate-metadata', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jobId }),
});

const result = await response.json();

if (result.success) {
  console.log('✅ Metadata generated!\n');
  console.log('Title:', result.data.title);
  console.log('Description (first 300 chars):');
  console.log(result.data.description.substring(0, 300) + '...');

  // Check if duration is in title
  if (result.data.title.match(/\d+-(?:Minute|Hour)/)) {
    console.log('\n✅ Duration correctly added to title!');
  } else {
    console.log('\n⚠️  No duration found in title');
  }
} else {
  console.log('❌ Error:', result.error);
}
