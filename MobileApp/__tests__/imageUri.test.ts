import { toMlKitImageUri, toTesseractImagePath } from '../src/utils/imageUri';

describe('toTesseractImagePath', () => {
  it('returns bare absolute path unchanged', () => {
    const path = '/data/user/0/com.mobileapp/files/screen_captures/screen_123.jpg';
    expect(toTesseractImagePath(path)).toBe(path);
  });

  it('strips file:// prefix', () => {
    expect(toTesseractImagePath('file:///data/user/0/screen.jpg')).toBe(
      '/data/user/0/screen.jpg',
    );
  });

  it('returns null for content:// URIs', () => {
    expect(
      toTesseractImagePath(
        'content://com.mobileapp.fileprovider/screen_captures/screen_123.jpg',
      ),
    ).toBeNull();
  });
});

describe('toMlKitImageUri', () => {
  it('passes through content:// URIs unchanged', () => {
    const uri = 'content://com.mobileapp.fileprovider/screen_captures/screen.jpg';
    expect(toMlKitImageUri(uri)).toBe(uri);
  });
});
