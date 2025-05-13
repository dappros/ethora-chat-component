import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';

interface URLPreviewCardProps {
  url: string;
  isUserMessage: boolean;
}

const PreviewContainer = styled.div`
  border: 1px solid #e1e1e1;
  border-radius: 8px;
  padding: 10px;
  max-width: 350px;
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 5px;
  text-align: left;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  margin-bottom: 8px;
`;

const PreviewImage = styled.img`
  max-width: 100%;
  height: auto;
  max-height: 120px;
  object-fit: cover;
  border-radius: 4px;
  background-color: #f0f0f0;
  border-bottom: 1px solid #eee;
`;

const PreviewTitle = styled.div`
  font-weight: 600;
  font-size: 0.9em;
  color: #1a1a1a;
`;

const PreviewDescription = styled.div`
  font-size: 0.85em;
  color: #555;
  line-height: 1.4;
`;

const PreviewUrl = styled.a`
  font-size: 0.75em;
  color: #888;
  text-decoration: none;
  margin-top: 3px;
  &:hover {
    text-decoration: underline;
  }
`;

interface PreviewData {
  title?: string;
  description?: string;
  image?: string;
}

const URLPreviewCard: React.FC<URLPreviewCardProps> = ({
  url,
  isUserMessage,
}) => {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPreview = async () => {
      setLoading(true);
      setError(null);
      setPreviewData(null);

      try {
        const apiKey = '55b9e7f85f2b4e94505e96ef71c55a0e';
        if (!apiKey) {
          throw new Error(
            'Linkpreview API key is missing. Please set REACT_APP_LINKPREVIEW_API_KEY in your .env file.'
          );
        }

        const response = await axios.get(
          `https://api.linkpreview.net/?key=${apiKey}&q=${encodeURIComponent(url)}`
        );

        if (
          response.data &&
          (response.data.title ||
            response.data.description ||
            response.data.image)
        ) {
          setPreviewData({
            title: response.data.title,
            description: response.data.description,
            image: response.data.image,
          });
        } else {
          setError('Preview data not found');
        }
      } catch (err: any) {
        console.error('Error fetching URL preview via linkpreview.net:', err);

        let errorMessage = 'Could not load preview';
        if (axios.isAxiosError(err)) {
          errorMessage =
            err.response?.data?.description || err.message || errorMessage;
        } else if (err instanceof Error) {
          errorMessage = err.message;
        }
        setError(errorMessage);
        setPreviewData(null);
      } finally {
        setLoading(false);
      }
    };

    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      fetchPreview();
    } else {
      setLoading(false);
    }
  }, [url]);

  if (loading || error || !previewData) {
    return null;
  }

  let displayHostname = url;
  try {
    displayHostname = new URL(url).hostname;
  } catch (_) {}

  return (
    <PreviewContainer style={{}}>
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
