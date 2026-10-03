const fs = require('fs');
const glob = require('glob');
const files = [
  'src/lib/auth.ts',
  'src/middleware/require-api-key.ts',
  'src/middleware/require-auth.ts',
  'src/middleware/try-auth-then-api-key.ts',
  'src/modules/auth/auth.controller.ts',
  'src/modules/auth/auth.routes.ts',
  'src/modules/auth/auth.service.ts'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  // I broke it by changing `./` to `../`. Let's fix it back manually for those files.
});
