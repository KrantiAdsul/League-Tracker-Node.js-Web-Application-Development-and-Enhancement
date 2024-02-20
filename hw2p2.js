const axios = require('axios');
const { EntityNotFoundError, ApiError } = require('./error');

class SpotifyApi {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://api.spotify.com/v1/';
  }

  static getAccessToken(clientId, clientSecret) {
    const bearer = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    return axios.post(
      'https://accounts.spotify.com/api/token',
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${bearer}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )
      .then(response => response.data.access_token)
      .catch(() => {
        throw new ApiError('Failed to obtain access token');
      });
  }

  async getAlbum(albumId, callback) {
    try {
      const response = await this.makeApiRequest(`albums/${albumId}`);
      const formattedAlbum = await this.formatAlbum(response);
  
      // Return the formattedAlbum or invoke the callback with it
      if (callback) {
        callback(null, formattedAlbum);
      } else {
        return formattedAlbum;
      }
    } catch (error) {
      if (callback) {
        callback(error);
      } else {
        throw error;
      }
    }
  }  

  searchAlbums(query, callback) {
    this.makeApiRequest(`search?q=${encodeURIComponent(query)}&type=album`)
      .then(response => {
        const albumPromises = response.albums.items.map(album => this.formatAlbum(album, callback));
        return Promise.all(albumPromises);
      })
      .then(formattedAlbums => {
        callback(null, formattedAlbums.filter(Boolean));
      })
      .catch(error => callback(error));
  }

  getTrack(trackId, callback) {
    this.makeApiRequest(`tracks/${trackId}`)
      .then(response => {
        callback(null, this.formatTrack(response));
      })
      .catch(error => {
        callback(error);
      });
}

searchTracks(query, callback) {
    this.makeApiRequest(`search?q=${encodeURIComponent(query)}&type=track`)
      .then(response => {
        const formattedTracks = response.tracks.items.map(track => this.formatTrack(track, callback));
        callback(null, formattedTracks);
      })
      .catch(error => {
        callback(error);
      });
}

getArtist(artistId, callback) {
  return this.makeApiRequest(`artists/${artistId}`)
    .then(response => {
      const formattedArtist = this.formatArtist(response);
      if (callback) {
        console.log("Imma here")
        callback(null, formattedArtist);
      } else {
        return Promise.resolve(formattedArtist);
      }
    })
    .catch(error => {
      if (callback) {
        callback(error); // Pass the error to the callback
      } else {
        return Promise.reject(error);
      }
    });
}

getArtistTopTracks(artistId, country, callback) {
  return this.makeApiRequest(`artists/${artistId}/top-tracks?country=${country}`)
    .then(response => {
      const formattedTracks = response.tracks.map(track => this.formatTrack(track));
      if (callback) {
        callback(null, formattedTracks); // Pass the data to the callback
      }
      return formattedTracks; // Return the data as a Promise
    })
    .catch(error => {
      if (callback) {
        callback(error); // Pass the error to the callback
      }
      return Promise.reject(error); // Return the error as a rejected Promise
    });
}

getPlaylist(playlistId, callback) {
    this.makeApiRequest(`playlists/${playlistId}`)
      .then(response => {
        callback(null, this.formatPlaylist(response));
      })
      .catch(error => {
        callback(error);
      });
}

makeApiRequest(endpoint) {
  return axios.get(`${this.baseUrl}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${this.accessToken}`,
    },
  })
    .then(response => response.data)
    .catch(error => {
      if (error.response && error.response.status === 404) {
        throw new EntityNotFoundError('Entity not found');
      } else {
        throw new ApiError('API error');
      }
    });
}

  formatAlbum(albumData) {
    // Extract relevant data from albumData
    const { id, artists, genres, name, images, release_date, tracks } = albumData;

    // Fetch artist information asynchronously
    const artistPromises = artists.map(artist => {
        return this.getArtist(artist.id)
            .then(response => this.formatArtist(response))
            .catch(error => {
                console.error("Error formatting artist:", error);
                return null;
            });
    });

    // Process tracks in parallel if they exist
    let trackPromises = [];
    if (tracks && tracks.items && tracks.items.length > 0) {
        trackPromises = tracks.items.map(track => {
            return this.makeApiRequest(`tracks/${track.id}`)
                .then(response => this.formatTrack(response))
                .catch(error => {
                    console.error("Error formatting track:", error);
                    return null;
                });
        });
    }

    return Promise.all(artistPromises)
        .then(formattedArtists => Promise.all(trackPromises)
            .then(formattedTracks => {
                const formattedAlbum = {
                    albumId: id,
                    artists: formattedArtists.filter(Boolean), // Filter out null values
                    genres: genres,
                    name: name,
                    imageUrl: images[0]?.url || '', // Provide a default value for imageUrl
                    releaseDate: release_date,
                    tracks: formattedTracks.filter(Boolean), // Filter out null values
                };
                return formattedAlbum;
            }))
        .catch(error => {
            console.error("Failed to format album:", error);
            throw new ApiError('Failed to format album');
        });
}

formatTracks(trackItems) {
    if (!Array.isArray(trackItems)) {
        return []; // or handle it as needed, e.g., return an empty array
    }
    return trackItems.map(track => this.formatTrack(track));
}

formatTrack(trackData) {
    // Check if trackData.artists is defined and an array
    const artists = Array.isArray(trackData.artists) ? trackData.artists.map(artist => this.formatArtist(artist)) : [];

    const formattedTrack = {
        albumId: trackData.album.id,
        artists,
        durationMs: trackData.duration_ms,
        trackId: trackData.id,
        name: trackData.name,
        popularity: trackData.popularity,
        previewUrl: trackData.preview_url || '', // Provide a default value for previewUrl
    };

    return formattedTrack;
}

formatArtist(artistData) {
    const formattedArtist = {
        artistId: artistData.id || '',
        followers: artistData.followers || 0,
        genres: artistData.genres || [],
        imageUrl: (artistData.images && artistData.images.length > 0) ? artistData.images[0].url : '', // Check if images array exists and has elements
        name: artistData.name || '',
        popularity: artistData.popularity || 0,
    };
    return formattedArtist;
}

formatPlaylist(playlistData) {
    // Check if playlistData.tracks and playlistData.tracks.items exist and are arrays
    const tracks = Array.isArray(playlistData.tracks?.items) ? this.formatTracks(playlistData.tracks) : [];

    const formattedPlaylist = {
        description: playlistData.description || '', // Add a default empty string if description is missing
        followers: playlistData.followers,
        playlistId: playlistData.id,
        imageUrl: playlistData.images[0]?.url || '', // Provide a default value for imageUrl
        name: playlistData.name,
        owner: this.formatUser(playlistData.owner),
        public: playlistData.public,
        tracks: tracks, // Assign the formatted tracks
    };

    return formattedPlaylist;
}

formatUser(userData) {
    const formattedUser = {
        userId: userData.id,
    };

    return formattedUser;
}

}

exports.SpotifyApi = SpotifyApi;