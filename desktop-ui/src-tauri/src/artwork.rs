//! Presentation-only image preparation for the GPU ash renderer. Browser CORS
//! can prevent uploading a displayed image to WebGL; return a bounded local copy.
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{header, redirect, Client, Url};
use std::{sync::OnceLock, time::Duration};

const MAX_BYTES: usize = 4 * 1024 * 1024;
static CLIENT: OnceLock<Result<Client, String>> = OnceLock::new();

fn image_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "Invalid artwork address")?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Artwork requires an HTTPS image address without credentials".into());
    }
    Ok(url)
}

fn image_type(value: &str) -> Result<&str, String> {
    let mime = value.split(';').next().unwrap_or("").trim();
    match mime {
        "image/jpeg"
        | "image/png"
        | "image/webp"
        | "image/avif"
        | "image/gif"
        | "image/svg+xml"
        | "image/bmp"
        | "image/x-icon"
        | "image/vnd.microsoft.icon" => Ok(mime),
        _ => Err("Artwork response is not a supported image".into()),
    }
}

async fn download_image(client: &Client, url: Url) -> Result<String, String> {
    let mut response = client
        .get(url)
        .header(header::ACCEPT, "image/avif,image/webp,image/*")
        .send()
        .await
        .map_err(|_| "Artwork request failed")?
        .error_for_status()
        .map_err(|_| "Artwork request failed")?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_BYTES as u64)
    {
        return Err("Artwork exceeds the image size limit".into());
    }
    let mime = image_type(
        response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|h| h.to_str().ok())
            .unwrap_or(""),
    )?
    .to_owned();
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Artwork download failed")?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_BYTES {
            return Err("Artwork exceeds the image size limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return Err("Artwork image is empty".into());
    }
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[tauri::command]
pub async fn artwork_image_data_url(url: String) -> Result<String, String> {
    let url = image_url(&url)?;
    let client = CLIENT
        .get_or_init(|| {
            Client::builder()
                .timeout(Duration::from_secs(2))
                .redirect(redirect::Policy::custom(|attempt| {
                    if attempt.previous().len() >= 3 || image_url(attempt.url().as_str()).is_err() {
                        attempt.stop()
                    } else {
                        attempt.follow()
                    }
                }))
                .build()
                .map_err(|_| "Artwork client unavailable".into())
        })
        .as_ref()
        .map_err(Clone::clone)?;
    // No cookies, account/bridge bearer headers, or caller-supplied headers.
    // Errors deliberately omit provider URLs, which can contain signed tokens.
    download_image(client, url).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    #[test]
    fn only_https_images_without_url_credentials_are_accepted() {
        assert!(image_url("https://art.example/poster.jpg?signature=private").is_ok());
        for value in [
            "file:///C:/private",
            "data:image/png,abc",
            "http://art.example/p.jpg",
            "https://user:password@art.example/p.jpg",
            "not a url",
        ] {
            assert!(image_url(value).is_err());
        }
        assert!(image_type("text/html").is_err());
        assert_eq!(
            image_type("image/png; charset=binary").unwrap(),
            "image/png"
        );
    }

    // HTTP exists only inside this private helper's local test. The public
    // command validates HTTPS before calling it; no external service is used.
    async fn serve_response(response: Vec<u8>) -> Result<String, String> {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 4096];
            let _ = stream.read(&mut request);
            let _ = stream.write_all(&response);
        });
        let result = download_image(
            &Client::new(),
            Url::parse(&format!("http://{address}/art")).unwrap(),
        )
        .await;
        server.join().unwrap();
        result
    }

    #[tokio::test]
    async fn returns_a_local_image_and_rejects_html_empty_and_oversized_responses() {
        let png = STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPS8AAAAASUVORK5CYII=").unwrap();
        let mut response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\n\r\n",
            png.len()
        )
        .into_bytes();
        response.extend(&png);
        assert_eq!(
            serve_response(response).await.unwrap(),
            format!("data:image/png;base64,{}", STANDARD.encode(png))
        );
        assert!(serve_response(
            b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 4\r\n\r\nhtml".to_vec()
        )
        .await
        .is_err());
        assert!(serve_response(
            b"HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 0\r\n\r\n".to_vec()
        )
        .await
        .is_err());
        assert!(serve_response(
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\n\r\n",
                MAX_BYTES + 1
            )
            .into_bytes()
        )
        .await
        .is_err());
        let mut response =
            b"HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nConnection: close\r\n\r\n".to_vec();
        response.resize(response.len() + MAX_BYTES + 1, 0);
        assert!(serve_response(response).await.is_err());
    }
}
