import { useState, useEffect } from 'react';
import { useStaff } from '@/src/context/StaffContext';

/**
 * Hook to fetch location-assigned tenders
 * 1. First tries to use cached tenders from localStorage
 * 2. If no cache, fetches from /api/location/tenders
 * 3. Caches the fetched data for next use
 * 
 * Returns: { tenders: Array, loading: Boolean, error: String|null }
 */
export function useLocationTenders() {
  const { location, getCachedTenders, setCachedTenders } = useStaff();
  const [tenders, setTenders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Guard against missing location
    if (!location?._id) {
      console.log('⚠️ useLocationTenders: No location ID available');
      setTenders([]);
      setError(null);
      setLoading(false);
      return;
    }

    const fetchTenders = async () => {
      // 1️⃣ TRY CACHED DATA FIRST
      const cachedTenders = getCachedTenders(location._id);
      if (cachedTenders && cachedTenders.length > 0) {
        console.log(`⚡ useLocationTenders: Using ${cachedTenders.length} cached tenders instantly (no loading state)`);
        cachedTenders.forEach(t => {
          console.log(`   - ${t.name} (${t.classification}): ${t.buttonColor}`);
        });
        setTenders(cachedTenders);
        setLoading(false); // No loading state for cached data
        setError(null);
        return;
      }

      // 2️⃣ ONLY SHOW LOADING IF FETCHING FROM API
      console.log('💾 useLocationTenders: No cache found, fetching from API...');
      setLoading(true);
      setError(null);
      
      try {
        const url = `/api/location/tenders?locationId=${location._id}`;
        console.log('📡 Fetching from:', url);
        
        const response = await fetch(url);
        
        console.log('📡 API Response Status:', response.status, response.statusText);

        // Handle 404 gracefully (location found but no tenders assigned)
        if (response.status === 404) {
          console.log('⚠️ useLocationTenders: Location found but no tenders assigned');
          setTenders([]);
          setError(null);
          setLoading(false);
          return;
        }

        // Handle other error statuses
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        console.log('📦 API Response Data:', data);
        
        if (!data.success) {
          console.warn('⚠️ useLocationTenders: API returned success=false:', data.message);
          setTenders([]);
          setError(data.message || 'Failed to load tenders');
          setLoading(false);
          return;
        }

        // Get tenders from response
        const locationTenders = data.tenders || [];
        console.log(`📋 Raw tenders from API: ${locationTenders.length} items`);
        
        // Normalize each tender to proper format
        const normalizedTenders = locationTenders.map(tender => {
          console.log('   Processing tender:', tender.name, 'ID:', tender.id);
          if (typeof tender === 'string') {
            return { id: tender, name: 'Tender', classification: 'Other' };
          }
          return {
            id: tender._id?.toString() || tender.id,
            name: tender.name || 'Tender',
            description: tender.description || '',
            buttonColor: tender.buttonColor || '#9dccebff',
            classification: tender.classification || 'Other',
            active: tender.active !== false,
          };
        });

        console.log(`✅ useLocationTenders: Loaded ${normalizedTenders.length} tenders from API`);
        normalizedTenders.forEach(t => {
          console.log(`   - ${t.name} (${t.classification}): ${t.buttonColor}`);
        });
        
        // 3️⃣ CACHE THE DATA FOR NEXT TIME
        setCachedTenders(location._id, normalizedTenders);
        
        setTenders(normalizedTenders);
        setError(null);
        setLoading(false);
      } catch (err) {
        console.error('❌ useLocationTenders: Error fetching tenders:', err.message);
        console.error('📋 Location:', location?.name, location?._id);
        setTenders([]);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchTenders();
  }, [location?._id, location?.name, getCachedTenders, setCachedTenders]);

  return { tenders, loading, error };
}
