import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';

interface URLPreviewCardProps {
  url: string;
  isUserMessage: boolean;
}

const PreviewContainer = styled.div`
  border: 1px solid var(--ethora-color-border, #e1e1e1);
  border-radius: var(--ethora-radius-sm, 8px);
  padding: 8px;
  background-color: var(--ethora-color-bg, #ffffff);
  display: flex;
  flex-direction: column;
  text-align: left;
  box-shadow: var(--ethora-shadow-sm, 0 1px 2px rgba(16, 24, 40, 0.06));
  margin: 4px 0px;
`;

const PreviewImage = styled.img`
  max-width: 100%;
  height: auto;
  max-height: 120px;
  object-fit: cover;
  border-radius: var(--ethora-radius-sm, 4px);
  background-color: var(--ethora-color-bg-subtle, #f0f0f0);
  border-bottom: 1px solid var(--ethora-color-border, #eee);
`;

const PreviewTitle = styled.div`
  font-weight: 600;
  font-size: 0.9em;
  color: var(--ethora-color-text, #1a1a1a);
`;

const PreviewDescription = styled.div`
  font-size: 0.85em;
  color: var(--ethora-color-text-secondary, #555);
  line-height: 1.4;
`;

const PreviewUrl = styled.a`
  font-size: 0.75em;
  color: var(--ethora-color-text-muted, #888);
  text-decoration: none;
  margin-top: 3px;
  &:hover {
    text-decoration: underline;
  }
  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

interface PreviewData {
  title?: string;
  description?: string;
  image?: string;
}

// Module-level cache + in-flight dedup (same pattern as roomMembers.api.ts).
// Message bubbles remount constantly (scroll, room switches); without this,
// every remount of every link-bearing message re-hit the rate-limited
// linkpreview.net API. Failures are cached too so a dead URL is not retried
// on each remount.
const previewCache = new Map<string, PreviewData | null>();
const previewInflight = new Map<string, Promise<PreviewData | null>>();

const fetchPreviewData = (url: string): Promise<PreviewData | null> => {
  if (previewCache.has(url)) {
    return Promise.resolve(previewCache.get(url) ?? null);
  }
  const existing = previewInflight.get(url);
  if (existing) return existing;

  const apiKey = '55b9e7f85f2b4e94505e96ef71c55a0e';
  const request = axios
    .get(
      `https://api.linkpreview.net/?key=${apiKey}&q=${encodeURIComponent(url)}`
    )
    .then((response) => {
      if (
        response.data &&
        (response.data.title ||
          response.data.description ||
          response.data.image)
      ) {
        const data: PreviewData = {
          title: response.data.title,
          description: response.data.description,
          image: response.data.image,
        };
        previewCache.set(url, data);
        return data;
      }
      previewCache.set(url, null);
      return null;
    })
    .catch((err) => {
      console.error('Error fetching URL preview via linkpreview.net:', err);
      previewCache.set(url, null);
      return null;
    })
    .finally(() => {
      previewInflight.delete(url);
    });

  previewInflight.set(url, request);
  return request;
};

const URLPreviewCard: React.FC<URLPreviewCardProps> = ({ url }) => {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      setLoading(true);
      setError(null);
      setPreviewData(null);
      fetchPreviewData(url).then((data) => {
        if (!mounted) return;
        if (data) {
          setPreviewData(data);
        } else {
          setError('Preview data not found');
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [url]);

  if (loading || error || !previewData) {
    return null;
  }

  let displayHostname = url;
  try {
    displayHostname = new URL(url).hostname;
  } catch (_) {
    // Ignore malformed URLs and fall back to the raw string.
  }

  return (
    <PreviewContainer>
      {previewData.image && (
        <PreviewImage src={previewData.image} alt="Preview" />
      )}
      {previewData.title && <PreviewTitle>{previewData.title}</PreviewTitle>}
      {previewData.description && (
        <PreviewDescription>{previewData.description}</PreviewDescription>
      )}
      <PreviewUrl href={url} target="_blank" rel="noopener noreferrer">
        {displayHostname}
      </PreviewUrl>
    </PreviewContainer>
  );
};

export default URLPreviewCard;
