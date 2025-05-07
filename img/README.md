# Profile and Comment Images Directory

This directory is used for storing images that can be uploaded to pump.fun for:

1. **Profile Images**: Used when creating user profiles via the `create-profiles` command
2. **Comment Images**: Used when posting comments with the `--with-image` flag

## Usage Instructions:

1. Place a **single image file** in this directory
2. Run the appropriate command with the image option enabled
3. The image will be uploaded to pump.fun's IPFS service and linked to your profile or comment

## Supported Image Formats:

- PNG, JPG, JPEG, GIF
- WEBP, BMP, TIFF, SVG
- ICO, HEIC, HEIF, AVIF, JFIF

## Important Notes:

- Only **one image** can be used at a time
- If multiple images are in this folder, the upload will fail
- After successful upload, the image URL is stored in `metadata.json` in the project root
- Square images work best for profile photos (recommended size: 500x500px)
- For comments, landscape images often display better
- Maximum file size: 5MB

## Example Commands:

```bash
# Create profile with image
npm run create-profiles -- --with-image

# Post comment with image
npm run post-replies -- --with-image
``` 