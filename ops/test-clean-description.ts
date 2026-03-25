const jobId = '77da3ada-3014-4e8b-8007-eb46c19c8458';

console.log('Testing new clean description format...\n');

const response = await fetch('http://localhost:8080/api/youtube/generate-metadata', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jobId }),
});

const result = await response.json();

if (result.success) {
  console.log('Title:', result.data.title);
  console.log('\nDescription:');
  console.log('─'.repeat(60));
  console.log(result.data.description);
  console.log('─'.repeat(60));

  // Check what was removed
  const checks = [
    { text: 'target', label: '❌ Target length removed' },
    { text: 'Free to use', label: '❌ "Free to use" removed' },
    { text: 'AI technology', label: '❌ AI disclosure removed' },
    { text: 'Purchase license', label: '✅ Purchase link kept' },
  ];

  console.log('\nChanges:');
  checks.forEach((check) => {
    const found = result.data.description.toLowerCase().includes(check.text.toLowerCase());
    console.log(found ? check.label : check.label.replace('✅', '❌').replace('❌', '✅'));
  });
} else {
  console.log('❌ Error:', result.error);
}
