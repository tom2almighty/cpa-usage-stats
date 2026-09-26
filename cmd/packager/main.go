package main

import (
	"archive/zip"
	"crypto/sha256"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

func main() {
	srcFile := flag.String("src", "", "Source file to package at zip root")
	zipFile := flag.String("out", "", "Output zip file path")
	appendChecksum := flag.String("checksum", "", "Optional checksums.txt file to append to")
	flag.Parse()

	if *srcFile == "" || *zipFile == "" {
		fmt.Fprintf(os.Stderr, "Usage: packager -src <file> -out <zipfile> [-checksum <checksums.txt>]\n")
		os.Exit(1)
	}

	if err := createZipRoot(*srcFile, *zipFile); err != nil {
		fmt.Fprintf(os.Stderr, "Error creating zip: %v\n", err)
		os.Exit(1)
	}

	hash, err := fileSHA256(*zipFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error hashing zip: %v\n", err)
		os.Exit(1)
	}

	zipBase := filepath.Base(*zipFile)
	checksumLine := fmt.Sprintf("%s  %s\n", hash, zipBase)
	fmt.Printf("%s", checksumLine)

	if *appendChecksum != "" {
		f, err := os.OpenFile(*appendChecksum, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error opening checksums file: %v\n", err)
			os.Exit(1)
		}
		defer f.Close()
		if _, err := f.WriteString(checksumLine); err != nil {
			fmt.Fprintf(os.Stderr, "Error writing checksums line: %v\n", err)
			os.Exit(1)
		}
	}
}

func createZipRoot(srcPath, zipPath string) error {
	baseName := filepath.Base(srcPath)

	srcF, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer srcF.Close()

	srcInfo, err := srcF.Stat()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(zipPath), 0755); err != nil {
		return err
	}

	zipF, err := os.Create(zipPath)
	if err != nil {
		return err
	}
	defer zipF.Close()

	w := zip.NewWriter(zipF)
	defer w.Close()

	header, err := zip.FileInfoHeader(srcInfo)
	if err != nil {
		return err
	}
	header.Name = baseName
	header.Method = zip.Deflate

	target, err := w.CreateHeader(header)
	if err != nil {
		return err
	}

	_, err = io.Copy(target, srcF)
	return err
}

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}
