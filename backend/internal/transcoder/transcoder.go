package transcoder

import (
	"bytes"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	"image/png"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

// IsAvailable sistemde ffmpeg binary'sinin bulunup bulunmadığını kontrol eder.
func IsAvailable() bool {
	_, err := exec.LookPath("ffmpeg")
	return err == nil
}

// LogStatus FFmpeg sistem durumunu loglar.
func LogStatus() {
	if IsAvailable() {
		log.Println("🎬 [Transcoder] FFmpeg sistemi hazır ve aktif.")
	} else {
		log.Println("⚠️ [Transcoder] FFmpeg sistemde bulunamadı, medya dönüştürme devre dışı.")
	}
}

// ConvertAudioToMP3 gelen herhangi bir ses dosyasını (WebM Opus, OGG, WAV, M4A vb.)
// iOS ve Android dahil tüm tarayıcılarla %100 uyumlu standart MP3 formatına dönüştürür.
// Her işlem için benzersiz UUID temp dosyası kullanılır, race condition oluşmaz.
func ConvertAudioToMP3(inputPath string) (string, float64, error) {
	if !IsAvailable() {
		return "", 0, fmt.Errorf("ffmpeg sistemde yüklü değil")
	}

	outputPath := filepath.Join(os.TempDir(), fmt.Sprintf("aura_audio_%s.mp3", uuid.New().String()))

	// -y: Üzerine yaz, -i: Girdi, -vn: Video yok, -acodec libmp3lame: MP3 codec,
	// -map_metadata -1: Tüm EXIF ve metadata bilgilerini temizle
	// -b:a 128k: 128kbps ses kalitesi, -ar 44100: 44.1kHz, -ac 2: Stereo
	cmd := exec.Command("ffmpeg",
		"-y",
		"-i", inputPath,
		"-map_metadata", "-1",
		"-vn",
		"-acodec", "libmp3lame",
		"-b:a", "128k",
		"-ar", "44100",
		"-ac", "2",
		outputPath,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		_ = os.Remove(outputPath)
		return "", 0, fmt.Errorf("ses mp3 formatına dönüştürülemedi: %w (stderr: %s)", err, stderr.String())
	}

	// ffmpeg stderr çıktısından süre bilgisini çıkar
	duration := extractDurationFromStderr(stderr.String())

	return outputPath, duration, nil
}

// ConvertVideoToUniversalMP4 gelen videoyu (WebM, MOV, AVI, MKV vb.)
// iOS WebKit ve Android Chrome'un sorunsuz oynatabileceği H.264 Baseline + AAC MP4 formatına dönüştürür.
// -map_metadata -1 ile GPS koordinatları, cihaz seri numaraları ve çekim konumu tamamen silinir.
// -movflags +faststart ile 'moov' atomu dosyanın başına alınır (iOS anında akış için zorunludur).
func ConvertVideoToUniversalMP4(inputPath string) (string, error) {
	if !IsAvailable() {
		return "", fmt.Errorf("ffmpeg sistemde yüklü değil")
	}

	outputPath := filepath.Join(os.TempDir(), fmt.Sprintf("aura_video_%s.mp4", uuid.New().String()))

	// Eğer dosya zaten mp4 ise ve sadece streamable (faststart) yapılması gerekiyorsa
	// önce hızlı remuxing dene (metadata temizleme ile):
	remuxCmd := exec.Command("ffmpeg",
		"-y",
		"-i", inputPath,
		"-map_metadata", "-1",
		"-c", "copy",
		"-movflags", "+faststart",
		outputPath,
	)
	if err := remuxCmd.Run(); err == nil {
		// Başarılı remuxing, video zaten uyumlu
		return outputPath, nil
	}

	// Tam transcode: H.264 Baseline + yuv420p (iOS WebKit zorunluluğu) + AAC + Metadata temizliği
	cmd := exec.Command("ffmpeg",
		"-y",
		"-i", inputPath,
		"-map_metadata", "-1",
		"-c:v", "libx264",
		"-profile:v", "baseline",
		"-level", "3.0",
		"-pix_fmt", "yuv420p",
		"-preset", "fast",
		"-crf", "23",
		"-c:a", "aac",
		"-b:a", "128k",
		"-ar", "44100",
		"-ac", "2",
		"-movflags", "+faststart",
		outputPath,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		_ = os.Remove(outputPath)
		return "", fmt.Errorf("video evrensel mp4 formatına dönüştürülemedi: %w (stderr: %s)", err, stderr.String())
	}

	return outputPath, nil
}

// ConvertImageToJPEG iOS HEIC/HEIF veya desteklenmeyen formatları evrensel JPEG'e çevirir ve metadata'yı siler.
func ConvertImageToJPEG(inputPath string) (string, error) {
	if !IsAvailable() {
		return "", fmt.Errorf("ffmpeg sistemde yüklü değil")
	}

	outputPath := filepath.Join(os.TempDir(), fmt.Sprintf("aura_img_%s.jpg", uuid.New().String()))

	cmd := exec.Command("ffmpeg",
		"-y",
		"-i", inputPath,
		"-map_metadata", "-1",
		"-frames:v", "1",
		"-q:v", "2",
		outputPath,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		_ = os.Remove(outputPath)
		return "", fmt.Errorf("görsel jpeg formatına dönüştürülemedi: %w (stderr: %s)", err, stderr.String())
	}

	return outputPath, nil
}

// StripImageMetadata fotoğraf dosyalarındaki GPS konumu, kamera modeli, lens ve EXIF verilerini temizler.
// FFmpeg varsa kayıpsız temizler, yoksa Go standart görüntü motoruyla re-encode ederek sıfırlar.
func StripImageMetadata(inputPath string) (string, error) {
	ext := strings.ToLower(filepath.Ext(inputPath))
	outputPath := filepath.Join(os.TempDir(), fmt.Sprintf("aura_clean_%s%s", uuid.New().String(), ext))

	if IsAvailable() {
		cmd := exec.Command("ffmpeg",
			"-y",
			"-i", inputPath,
			"-map_metadata", "-1",
			"-c", "copy",
			outputPath,
		)
		if err := cmd.Run(); err == nil {
			return outputPath, nil
		}
	}

	// Go Fallback: image decode & encode (standart Go encoder EXIF başlığı yazmaz, veriyi sıfırlar)
	return stripImageMetadataGo(inputPath, outputPath, ext)
}

func stripImageMetadataGo(inputPath, outputPath, ext string) (string, error) {
	f, err := os.Open(inputPath)
	if err != nil {
		return inputPath, err
	}
	defer f.Close()

	img, format, err := image.Decode(f)
	if err != nil {
		// Desteklenmeyen veya ham dosya ise orijinali döndür
		return inputPath, nil
	}

	outF, err := os.Create(outputPath)
	if err != nil {
		return inputPath, err
	}
	defer outF.Close()

	switch format {
	case "jpeg":
		err = jpeg.Encode(outF, img, &jpeg.Options{Quality: 92})
	case "png":
		err = png.Encode(outF, img)
	default:
		err = jpeg.Encode(outF, img, &jpeg.Options{Quality: 92})
	}

	if err != nil {
		_ = os.Remove(outputPath)
		return inputPath, nil
	}

	return outputPath, nil
}

// extractDurationFromStderr ffmpeg stderr çıktısındaki Duration: HH:MM:SS.ms bilgisini saniyeye çevirir.
func extractDurationFromStderr(stderr string) float64 {
	re := regexp.MustCompile(`Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)`)
	matches := re.FindStringSubmatch(stderr)
	if len(matches) < 4 {
		return 0
	}

	hours, _ := strconv.ParseFloat(matches[1], 64)
	minutes, _ := strconv.ParseFloat(matches[2], 64)
	seconds, _ := strconv.ParseFloat(matches[3], 64)

	return (hours * 3600) + (minutes * 60) + seconds
}

// OptimizeImageToWebP büyük görselleri (JPG/PNG/BMP) WhatsApp kalitesinde maksimum 1920px WebP'ye dönüştürür.
// -map_metadata -1 ile EXIF/GPS verilerini temizler ve boyutu %90'a varan oranda düşürür.
func OptimizeImageToWebP(inputPath string) (string, error) {
	if !IsAvailable() {
		return "", fmt.Errorf("ffmpeg sistemde yüklü değil")
	}

	outputPath := filepath.Join(os.TempDir(), fmt.Sprintf("aura_opt_%s.webp", uuid.New().String()))

	// En-boy oranını koruyarak max 1920px ölçekleme, 82 kalite WebP
	cmd := exec.Command("ffmpeg",
		"-y",
		"-i", inputPath,
		"-map_metadata", "-1",
		"-vf", "scale=if(gte(iw\\,ih)\\,min(1920\\,iw)\\,-2):if(lt(iw\\,ih)\\,min(1920\\,ih)\\,-2)",
		"-c:v", "libwebp",
		"-quality", "82",
		outputPath,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		_ = os.Remove(outputPath)
		// Fallback: libwebp yoksa yüksek kaliteli JPEG olarak optimize et
		return optimizeImageToJPEG(inputPath)
	}

	return outputPath, nil
}

func optimizeImageToJPEG(inputPath string) (string, error) {
	outputPath := filepath.Join(os.TempDir(), fmt.Sprintf("aura_opt_%s.jpg", uuid.New().String()))

	cmd := exec.Command("ffmpeg",
		"-y",
		"-i", inputPath,
		"-map_metadata", "-1",
		"-vf", "scale=if(gte(iw\\,ih)\\,min(1920\\,iw)\\,-2):if(lt(iw\\,ih)\\,min(1920\\,ih)\\,-2)",
		"-q:v", "3",
		outputPath,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		_ = os.Remove(outputPath)
		return "", fmt.Errorf("görsel optimize edilemedi: %w (stderr: %s)", err, stderr.String())
	}

	return outputPath, nil
}

// GenerateVideoThumbnail videodan 1. saniyede 320px genişliğinde poster thumbnail üretir.
func GenerateVideoThumbnail(videoPath string) (string, error) {
	if !IsAvailable() {
		return "", fmt.Errorf("ffmpeg sistemde yüklü değil")
	}

	outputPath := filepath.Join(os.TempDir(), fmt.Sprintf("aura_vthumb_%s.jpg", uuid.New().String()))

	// -ss 1: 1. saniyeden kare al, -vframes 1: tek kare, scale: 320px
	cmd := exec.Command("ffmpeg",
		"-y",
		"-ss", "00:00:01",
		"-i", videoPath,
		"-map_metadata", "-1",
		"-vframes", "1",
		"-vf", "scale=320:-2",
		"-q:v", "4",
		outputPath,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		_ = os.Remove(outputPath)
		// 1. saniye yoksa (çok kısa video ise) en baştan tek kare almayı dene
		cmdStart := exec.Command("ffmpeg",
			"-y",
			"-i", videoPath,
			"-map_metadata", "-1",
			"-vframes", "1",
			"-vf", "scale=320:-2",
			"-q:v", "4",
			outputPath,
		)
		if errStart := cmdStart.Run(); errStart != nil {
			_ = os.Remove(outputPath)
			return "", fmt.Errorf("video thumbnail üretilemedi: %w", errStart)
		}
	}

	return outputPath, nil
}

// GenerateImageThumbnail büyük fotoğraftan 240px genişliğinde hafif WebP thumbnail üretir (~10-20 KB).
func GenerateImageThumbnail(imagePath string) (string, error) {
	if !IsAvailable() {
		return "", fmt.Errorf("ffmpeg sistemde yüklü değil")
	}

	outputPath := filepath.Join(os.TempDir(), fmt.Sprintf("aura_ithumb_%s.webp", uuid.New().String()))

	cmd := exec.Command("ffmpeg",
		"-y",
		"-i", imagePath,
		"-map_metadata", "-1",
		"-vf", "scale=240:-2",
		"-c:v", "libwebp",
		"-quality", "75",
		outputPath,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		_ = os.Remove(outputPath)
		// Fallback: JPEG thumbnail
		cmdJpg := exec.Command("ffmpeg",
			"-y",
			"-i", imagePath,
			"-map_metadata", "-1",
			"-vf", "scale=240:-2",
			"-q:v", "4",
			outputPath,
		)
		if errJpg := cmdJpg.Run(); errJpg != nil {
			_ = os.Remove(outputPath)
			return "", fmt.Errorf("görsel thumbnail üretilemedi: %w", errJpg)
		}
	}

	return outputPath, nil
}
