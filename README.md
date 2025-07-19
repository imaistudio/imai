# Next.js & HeroUI Template

This is a template for creating applications using Next.js 14 (app directory) and HeroUI (v2).

[Try it on CodeSandbox](https://githubbox.com/heroui-inc/heroui/next-app-template)

## Technologies Used

- [Next.js 14](https://nextjs.org/docs/getting-started)
- [HeroUI v2](https://heroui.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Tailwind Variants](https://tailwind-variants.org)
- [TypeScript](https://www.typescriptlang.org/)
- [Framer Motion](https://www.framer.com/motion/)
- [next-themes](https://github.com/pacocoursey/next-themes)

## How to Use

### Use the template with create-next-app

To create a new project based on this template using `create-next-app`, run the following command:

```bash
npx create-next-app -e https://github.com/heroui-inc/next-app-template
```

### Install dependencies

You can use one of them `npm`, `yarn`, `pnpm`, `bun`, Example using `npm`:

```bash
npm install
```

### Run the development server

```bash
npm run dev
```

### Setup pnpm (optional)

If you are using `pnpm`, you need to add the following code to your `.npmrc` file:

```bash
public-hoist-pattern[]=*@heroui/*
```

After modifying the `.npmrc` file, you need to run `pnpm install` again to ensure that the dependencies are installed correctly.

## File Path Testing

This project includes a utility to validate all asset file paths referenced in the JSON configuration files.

### Test Asset Paths

To check if all referenced files exist:

```bash
npm run test:paths
```

### Smoke Test

# Basic sequential tests

node scripts/smoke-test.js

# Include concurrent/queue testing

node scripts/smoke-test.js --queue

# Queue testing only

node scripts/smoke-test.js --queue-only

This will:

- ✅ Validate paths in `colors.json`, `designs.json`, and `products.json`
- 📊 Show success rates for each file
- 🔍 List any missing files with their paths
- 🎯 Exit with error code if files are missing

### Example Output

```bash
Testing colors.json...
✓ Existing files: 38
✗ Missing files: 0

Testing designs.json...
✓ Existing files: 159
✗ Missing files: 2
```

Use this before deployment to ensure all assets are properly referenced.

## License

Licensed under the [MIT license](https://github.com/heroui-inc/next-app-template/blob/main/LICENSE).
