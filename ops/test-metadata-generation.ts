// Test the metadata generation endpoint to see what it returns

const jobId = '77da3ada-3014-4e8b-8007-eb46c19c8458'; // Your Purple Lofi job

console.log('Testing metadata generation for job:', jobId);
console.log('Calling: POST /api/youtube/generate-metadata\n');

const response = await fetch('http://localhost:8080/api/youtube/generate-metadata', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jobId }),
});

const result = await response.json();

if (result.success) {
  console.log('✅ Metadata generated successfully!\n');
  console.log('Title:', result.data.title);
  console.log('\nDescription preview (first 500 chars):');
  console.log(result.data.description.substring(0, 500));
  console.log('\nTags:', result.data.tags.join(', '));

  // Check if it has the wrong "rap battle" template
  if (result.data.description.includes('rap battle')) {
    console.log('\n❌ WRONG: Still using rap battle template!');
  } else if (result.data.description.includes('HISTORICAL CONTEXT')) {
    console.log('\n❌ WRONG: Still using historical template!');
  } else if (result.data.description.includes('Free to use')) {
    console.log('\n✅ CORRECT: Using beat/music template!');
  }
} else {
  console.log('❌ Error:', result.error);
}
