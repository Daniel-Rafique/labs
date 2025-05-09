# Image Resources Directory

This directory is used for storing images that can be used with various features of the labs-volume-bot application:

## Purpose of this Directory:

1. **Profile Images**: Used when creating user profiles via the `create-profiles` command
2. **Comment Images**: Used when posting comments with the `--with-image` flag
3. **Trading Bot Visual Assets**: Used for visualization and reporting features

## Usage Instructions:

### For Profile Images:

1. Place a **single image file** in this directory
2. Run the profile creation command with the image option enabled:
   ```bash
   npm run create-profiles -- --with-image
   ```
3. The image will be uploaded to pump.fun's IPFS service and linked to your profile
4. For profile images, square images (1:1 aspect ratio) work best
5. Recommended size: 500x500 pixels

### For Comment Images:

1. Place a **single image file** in this directory
2. Run the comment posting command with the image option:
   ```bash
   npm run post-replies -- --with-image
   ```
3. The image will be included with your comment post
4. For comments, landscape images (16:9 or 4:3 aspect ratio) often display better
5. Memes, charts, and promotional graphics work well for engagement

### For Trading Bot:

When using the trading bot with visualization features, this directory can store:
- Charts of trading activity
- Performance metrics visualizations
- AI optimization graphs
- Token liquidity visualizations

## Supported Image Formats:

- **Common Web Formats**: PNG, JPG/JPEG, GIF, WEBP
- **Other Supported Formats**: BMP, TIFF, SVG, ICO
- **Modern Formats**: HEIC, HEIF, AVIF, JFIF

## Important Notes:

- For profile and comment operations, only **one image** can be used at a time
- If multiple images are in this folder when using these features, the first one alphabetically will be used (or the upload may fail, depending on the operation)
- After successful upload, the image URL is stored in `.config/metadata.json` for reference
- Maximum file size: 5MB (pump.fun restriction)
- Avoid using copyrighted images without permission
- Consider compressing large images before upload for faster processing

## Tips for Effective Images:

- **Profile Photos**: Use high-quality, distinctive images that stand out
- **Comment Images**: Use relevant, attention-grabbing visuals to increase engagement
- **Charts**: For trading discussions, clear charts with annotations work best
- **Memes**: Humor tends to get better engagement on pump.fun

## Example Commands:

```bash
# Create profile with image
npm run create-profiles -- --with-image

# Post comment with image
npm run post-replies -- --with-image

# Create profile with AI-generated content and image
npm run create-profiles -- --use-ai --with-image
```

## For Developers:

When adding new image-related features to the application, please use this directory for consistency. The image handling utilities are configured to look here by default.

If you're developing new features that require different types of images, consider creating subdirectories within this folder (e.g., `img/charts/`, `img/profiles/`, etc.). 