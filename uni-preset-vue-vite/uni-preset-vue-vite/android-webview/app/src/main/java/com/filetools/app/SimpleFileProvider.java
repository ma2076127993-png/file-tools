package com.filetools.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import java.io.File;
import java.io.FileNotFoundException;

public class SimpleFileProvider extends ContentProvider {
    private static final String AUTHORITY = "com.filetools.app.files";

    public static Uri uriFor(File file) {
        return new Uri.Builder()
                .scheme("content")
                .authority(AUTHORITY)
                .encodedPath(Uri.encode(file.getAbsolutePath()))
                .build();
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        String ext = MimeTypeMap.getFileExtensionFromUrl(uri.toString());
        String type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return type == null ? "application/octet-stream" : type;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = getSafeFile(uri);
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File file;
        try {
            file = getSafeFile(uri);
        } catch (FileNotFoundException e) {
            return null;
        }

        MatrixCursor cursor = new MatrixCursor(new String[] {
                OpenableColumns.DISPLAY_NAME,
                OpenableColumns.SIZE
        });
        cursor.addRow(new Object[] { file.getName(), file.length() });
        return cursor;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }

    private File getSafeFile(Uri uri) throws FileNotFoundException {
        String path = Uri.decode(uri.getEncodedPath());
        File file = new File(path == null ? "" : path);
        if (!file.exists() || !file.isFile()) {
            throw new FileNotFoundException("File not found");
        }
        File cacheDir = getContext().getCacheDir();
        try {
            String filePath = file.getCanonicalPath();
            String cachePath = cacheDir.getCanonicalPath();
            if (!filePath.startsWith(cachePath)) {
                throw new FileNotFoundException("File is outside cache");
            }
        } catch (Exception e) {
            throw new FileNotFoundException("File is unavailable");
        }
        return file;
    }
}
