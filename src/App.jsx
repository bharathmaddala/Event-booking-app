import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { Amplify } from 'aws-amplify'; // ONLY import Amplify from the main package now

// Lucide React for icons
import { Calendar, MapPin, Ticket, Users, Edit, Trash2, CheckCircle, XCircle, Info, PlusCircle, Save, X, Eye, BookOpen, Clock, Globe, Search } from 'lucide-react';


// --- AWS Amplify Configuration ---
// REPLACE THESE WITH YOUR ACTUAL AWS CONFIGURATION VALUES
const awsConfig = {
  Auth: {
    region: 'us-east-1', // e.g., 'us-east-1'
    userPoolId: 'us-east-1_6xvOeaPY9', // e.g., 'us-east-1_XXXXX'
    userPoolWebClientId: '3pg41qbvh2q6u4c589re1m65mi', // e.g., 'YYYYYYY'
    oauth: {
      domain: 'https://event-ticket-booking-application.auth.us-east-1.amazoncognito.com', // e.g., 'your-event-app-domain.auth.us-east-1.amazoncognito.com'
      scope: ['email', 'openid', 'profile', 'aws.cognito.signin.user.admin'],
      redirectSignIn: 'http://localhost:5173', // Your local frontend URL (or your deployed Amplify URL)
      redirectSignOut: 'http://localhost:5173', // Your local frontend URL (or your deployed Amplify URL)
      responseType: 'code' // Or 'token' for implicit grant, but 'code' is generally preferred
    }
  },
  API: {
    endpoints: [
      {
        name: 'EventTicketApi', // This name is used internally by Amplify if you use API.get/post/etc.
        endpoint: 'https://rkqt5gkgnd.execute-api.us-east-1.amazonaws.com/dev', // e.g., 'https://xxxxxxxxx.execute-api.your-region.amazonaws.com/dev'
        region: 'us-east-1', // Must match your API Gateway region
        custom_header: async () => {
          try {
            // Access Auth via Amplify.Auth
            const session = await Amplify.Auth.currentSession();
            return { Authorization: `Bearer ${session.getAccessToken().getJwtToken()}` };
          } catch (e) {
            console.warn("No active session, API call will be unauthenticated:", e);
            return {};
          }
        }
      }
    ]
  }
};

Amplify.configure(awsConfig); // Initializes the Amplify library with your AWS service configurations


// Context for authentication and user data
const AuthContext = createContext(null);

// --- API Service for Backend Calls ---
// This service abstracts direct fetch calls to your API Gateway endpoints.
const apiService = {
  // Common fetch utility function for all API calls
  callApi: async (method, path, body = null) => {
    try {
      let headers = {
        'Content-Type': 'application/json',
      };

      // Get authorization header from Amplify if user is authenticated
      const customHeaders = await awsConfig.API.endpoints[0].custom_header();
      headers = { ...headers, ...customHeaders };

      const options = {
        method: method,
        headers: headers,
        body: body ? JSON.stringify(body) : null, // Convert body to JSON string if present
      };

      // Construct the full API URL using the endpoint from awsConfig
      const response = await fetch(`${awsConfig.API.endpoints[0].endpoint}${path}`, options);

      // Check if the response was successful (status 2xx)
      if (!response.ok) {
        const errorData = await response.json(); // Attempt to parse error message from API Gateway
        throw new Error(errorData.message || 'Something went wrong with the API call.');
      }
      return await response.json(); // Parse and return the JSON response
    } catch (error) {
      console.error('API Call Error:', error);
      throw error; // Re-throw to be caught by specific component functions
    }
  },

  // Event Management API calls
  getEvents: async () => {
    return apiService.callApi('GET', '/events');
  },
  createEvent: async (eventData) => {
    return apiService.callApi('POST', '/events', eventData);
  },
  updateEvent: async (eventId, updatedData) => {
    return apiService.callApi('PUT', `/events/${eventId}`, updatedData);
  },
  deleteEvent: async (eventId) => {
    return apiService.callApi('DELETE', `/events/${eventId}`);
  },

  // Registration & Tickets API calls
  registerForEvent: async (registrationData) => {
    return apiService.callApi('POST', '/register', registrationData);
  },
  getRegistrationsForUser: async () => {
    return apiService.callApi('GET', '/registrations/me');
  },
  getRegistrationsForEvent: async (eventId) => {
    return apiService.callApi('GET', `/events/${eventId}/registrations`);
  },

  // Ticket Validation API call (for a separate staff app or internal use)
  validateTicket: async (ticketId) => {
    return apiService.callApi('POST', '/tickets/validate', { ticketId });
  }
};


// Custom Modal Component for messages (Error/Success/Info messages)
const MessageModal = ({ message, type, onClose }) => {
  if (!message) return null; // Don't render if no message

  const bgColor = type === 'success' ? 'bg-green-50' : 'bg-red-50';
  const borderColor = type === 'success' ? 'border-green-400' : 'border-red-400';
  const textColor = type === 'success' ? 'text-green-800' : 'text-red-800';
  const icon = type === 'success' ? <CheckCircle className="text-green-600" /> : <XCircle className="text-red-600" />;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`relative ${bgColor} ${borderColor} border-l-4 rounded-lg shadow-xl p-6 md:p-8 w-full max-w-md`}>
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700">
          <X size={20} /> {/* Close icon */}
        </button>
        <div className="flex items-start">
          <div className="flex-shrink-0 mt-1">
            {icon} {/* Dynamic icon based on message type */}
          </div>
          <div className="ml-4">
            <h3 className={`text-lg font-bold ${textColor} mb-2`}>
              {type === 'success' ? 'Success!' : 'Error!'} {/* Dynamic title */}
            </h3>
            <p className={`${textColor} text-sm`}>{message}</p> {/* Message content */}
          </div>
        </div>
        <div className="mt-6 text-right">
          <button
            onClick={onClose}
            className={`px-5 py-2 rounded-lg font-semibold shadow-md transition duration-200
            ${type === 'success' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};


// Main App Component
const App = () => {
  const [currentUser, setCurrentUser] = useState(null); // Stores authenticated user info
  const [isLoadingAuth, setIsLoadingAuth] = useState(true); // Manages loading state for authentication
  const [userId, setUserId] = useState(null); // Firebase user ID for Canvas environment
  const [modalMessage, setModalMessage] = useState(''); // Message for the modal
  const [modalType, setModalType] = useState('info'); // Type of message (success/error/info)

  // Function to display messages via the modal
  const showMessage = (message, type = 'info') => {
    setModalMessage(message);
    setModalType(type);
  };

  // Function to close the modal
  const closeModal = () => {
    setModalMessage('');
  };

  useEffect(() => {
    // --- Firebase Initialization for Canvas Environment ---
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : {
      apiKey: "dummy-api-key",
      authDomain: "dummy-auth-domain",
      projectId: "dummy-project-id",
      storageBucket: "dummy-storage-bucket",
      messagingSenderId: "dummy-messaging-sender-id",
      appId: "dummy-app-id"
    };

    const app = initializeApp(firebaseConfig);
    const firebaseAuth = getAuth(app);

    const unsubscribeFirebaseAuth = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        setUserId(user.uid);
        try {
          // Access Auth via Amplify.Auth
          const amplifyUser = await Amplify.Auth.currentAuthenticatedUser({ bypassCache: true });
          const groups = amplifyUser.signInUserSession.accessToken.payload['cognito:groups'] || [];
          let role = 'attendee';
          if (groups.includes('Organizers')) {
            role = 'organizer';
          }
          setCurrentUser({
            uid: amplifyUser.attributes.sub,
            email: amplifyUser.attributes.email,
            role: role,
            amplifyUser: amplifyUser
          });
        } catch (error) {
          console.warn("No Cognito user found or not authenticated with Cognito. Falling back to Firebase ID.", error);
          setCurrentUser({ uid: user.uid, email: user.email, role: null });
        }
      } else {
        setCurrentUser(null);
        setUserId(null);
      }
      setIsLoadingAuth(false);
    });

    const initialFirebaseAuth = async () => {
      try {
        const initialToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
        if (initialToken) {
          await signInWithCustomToken(firebaseAuth, initialToken);
        } else {
          await signInAnonymously(firebaseAuth);
        }
      } catch (error) {
        console.error("Firebase Anonymous Auth error:", error);
      }
    };
    initialFirebaseAuth();
    // --- End Firebase Initialization ---

    return () => {
      unsubscribeFirebaseAuth();
    };
  }, []);

  // --- AWS Cognito Authentication Functions ---
  const handleCognitoLogin = async (role) => {
    try {
      setIsLoadingAuth(true);
      if (!Amplify.Auth) { // Add this check
        console.error("Amplify.Auth is not initialized.");
        showMessage("Authentication service is not ready. Please try again or refresh.", "error");
        setIsLoadingAuth(false);
        return;
       }
       await Amplify.Auth.federatedSignIn({ provider: 'COGNITO' });
       showMessage(`Redirecting to Cognito for ${role} login...`, 'info');
     } catch (error) {
       console.error("Cognito Login Error:", error);
       showMessage("Failed to initiate login. Please ensure Cognito config is correct.", "error");
     } finally {
       setIsLoadingAuth(false);
     }
  };

  const handleCognitoLogout = async () => {
    try {
      setIsLoadingAuth(true);
      if (!Amplify.Auth) { // Add this check
        console.error("Amplify.Auth is not initialized for logout.");
        showMessage("Authentication service is not ready for logout. Please try again or refresh.", "error");
        setIsLoadingAuth(false);
        return;
       }
       await Amplify.Auth.signOut();
       showMessage("You have been logged out from AWS Cognito.", "success");
       const amplifyUser = await Amplify.Auth.currentAuthenticatedUser({ bypassCache: true }).catch(() => null);
       if (!amplifyUser) {
         setCurrentUser(null);
       }
     } catch (error) {
       console.error("Cognito Logout Error:", error);
       showMessage("Failed to log out from Cognito.", "error");
     } finally {
       setIsLoadingAuth(false);
     }
  };
  // --- End AWS Cognito Authentication Functions ---


  const renderContent = () => {
    if (isLoadingAuth) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 p-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mb-4"></div>
          <p className="text-xl font-semibold text-gray-700">Loading authentication...</p>
        </div>
      );
    }

    if (!currentUser || !currentUser.amplifyUser) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 p-4 text-center">
          <h1 className="text-5xl font-extrabold text-gray-800 mb-6 drop-shadow-lg">EventMaster</h1>
          <p className="text-lg text-gray-600 mb-10 max-w-md">Your seamless platform for event management and digital ticketing.</p>
          <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-6">
            <button
              onClick={() => handleCognitoLogin('organizer')}
              className="flex items-center justify-center px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition duration-300 transform hover:-translate-y-1 group"
            >
              <Calendar className="mr-3 group-hover:rotate-6 transition duration-200" size={24} />
              Login as Organizer
            </button>
            <button
              onClick={() => handleCognitoLogin('attendee')}
              className="flex items-center justify-center px-8 py-4 bg-gradient-to-r from-green-600 to-green-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition duration-300 transform hover:-translate-y-1 group"
            >
              <Ticket className="mr-3 group-hover:scale-110 transition duration-200" size={24} />
              Login as Attendee
            </button>
          </div>
          {userId && (
            <p className="mt-12 text-sm text-gray-500">
              Canvas environment user ID: <span className="font-mono bg-gray-200 px-2 py-1 rounded-md text-xs text-gray-700">{userId}</span><br/>
              Please log in with Cognito to access app features.
            </p>
          )}
        </div>
      );
    }

    if (currentUser.role === 'organizer') {
      return (
        <OrganizerDashboard onLogout={handleCognitoLogout} userId={currentUser.uid} showMessage={showMessage} />
      );
    } else if (currentUser.role === 'attendee') {
      return (
        <AttendeeDashboard onLogout={handleCognitoLogout} userId={currentUser.uid} showMessage={showMessage} />
      );
    } else {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
          <h1 className="text-4xl font-bold text-gray-800 mb-8">Welcome, {currentUser.email || 'User'}!</h1>
          <p className="text-lg text-gray-700 mb-4">Your role is not recognized. Please contact support.</p>
          <p className="mt-8 text-gray-600">
            User ID: {currentUser.uid}
          </p>
          <button
            onClick={handleCognitoLogout}
            className="mt-8 px-6 py-3 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition duration-300 transform hover:scale-105"
          >
            Logout
          </button>
        </div>
      );
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, isLoadingAuth, handleCognitoLogin, handleCognitoLogout }}>
      <div className="font-sans antialiased bg-gray-50 text-gray-800 min-h-screen">
        {renderContent()}
        <MessageModal message={modalMessage} type={modalType} onClose={closeModal} />
      </div>
    </AuthContext.Provider>
  );
};

const OrganizerDashboard = ({ onLogout, userId, showMessage }) => {
  const [events, setEvents] = useState([]);
  const [newEvent, setNewEvent] = useState({ name: '', date: '', time: '', location: '', description: '', ticketTypes: [{ id: `tkt-${Date.now()}-0`, name: 'Standard', price: '', capacity: '' }] });
  const [editingEventId, setEditingEventId] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchOrganizerEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.getEvents(); // No 'organizer' role param needed here as lambda determines from JWT
      const processedData = data.map(event => ({
        ...event,
        ticketTypes: event.ticketTypes.map(tt => ({
          ...tt,
          price: Number(tt.price),
          capacity: Number(tt.capacity),
          sold: Number(tt.sold)
        }))
      }));
      setEvents(processedData);
    } catch (error) {
      console.error('Error fetching events:', error);
      showMessage(`Failed to load events: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    if (userId) {
      fetchOrganizerEvents();
    }
  }, [userId, fetchOrganizerEvents]);

  const handleNewEventChange = (e) => {
    const { name, value } = e.target;
    setNewEvent(prev => ({ ...prev, [name]: value }));
  };

  const handleTicketTypeChange = (index, e) => {
    const { name, value } = e.target;
    const updatedTicketTypes = [...newEvent.ticketTypes];
    updatedTicketTypes[index] = { ...updatedTicketTypes[index], [name]: value };
    setNewEvent(prev => ({ ...prev, ticketTypes: updatedTicketTypes }));
  };

  const addTicketType = () => {
    setNewEvent(prev => ({
      ...prev,
      ticketTypes: [...prev.ticketTypes, { id: `tkt-${Date.now()}-${prev.ticketTypes.length}`, name: '', price: '', capacity: '' }]
    }));
  };

  const removeTicketType = (index) => {
    const updatedTicketTypes = newEvent.ticketTypes.filter((_, i) => i !== index);
    setNewEvent(prev => ({ ...prev, ticketTypes: updatedTicketTypes }));
  };

  const handleCreateOrUpdateEvent = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const eventDataToSend = {
        ...newEvent,
        ticketTypes: newEvent.ticketTypes.map(tt => ({
          ...tt,
          price: String(tt.price),
          capacity: Number(tt.capacity),
          sold: Number(tt.sold || 0)
        }))
      };

      if (editingEventId) {
        const result = await apiService.updateEvent(editingEventId, eventDataToSend);
        if (result.message) {
          showMessage('Event updated successfully!', 'success');
          setEditingEventId(null);
        } else {
          showMessage('Failed to update event.', 'error');
        }
      } else {
        const result = await apiService.createEvent(eventDataToSend);
        if (result.message) {
          showMessage('Event created successfully!', 'success');
          setNewEvent({ name: '', date: '', time: '', location: '', description: '', ticketTypes: [{ id: `tkt-${Date.now()}-0`, name: 'Standard', price: '', capacity: '' }] });
        } else {
          showMessage('Failed to create event.', 'error');
        }
      }
      fetchOrganizerEvents();
    } catch (error) {
      console.error('Error saving event:', error);
      showMessage(`An error occurred while saving the event: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (event) => {
    setNewEvent({
      ...event,
      ticketTypes: event.ticketTypes.map(tt => ({
        ...tt,
        price: Number(tt.price),
        capacity: Number(tt.capacity),
        sold: Number(tt.sold)
      }))
    });
    setEditingEventId(event.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteEvent = async (eventId) => {
    if (window.confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
      setLoading(true);
      try {
        await apiService.deleteEvent(eventId);
        showMessage('Event deleted successfully!', 'success');
        fetchOrganizerEvents();
      } catch (error) {
        console.error('Error deleting event:', error);
        showMessage(`Failed to delete event: ${error.message}`, 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleToggleEventStatus = async (event) => {
    setLoading(true);
    const newStatus = event.status === 'published' ? 'draft' : 'published';
    try {
      await apiService.updateEvent(event.id, { status: newStatus });
      showMessage(`Event status updated to ${newStatus}!`, 'success');
      fetchOrganizerEvents();
    } catch (error) {
      console.error('Error updating status:', error);
      showMessage(`An error occurred while updating event status: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-8">
      <header className="flex flex-col sm:flex-row justify-between items-center mb-8 pb-4 border-b-2 border-blue-200">
        <h1 className="text-4xl font-extrabold text-indigo-800 drop-shadow-sm mb-4 sm:mb-0">Organizer Dashboard</h1>
        <div className="flex items-center space-x-4">
          <span className="text-indigo-700 text-lg">Your ID: <span className="font-mono bg-indigo-200 px-2 py-1 rounded-md text-sm text-indigo-800 select-all">{userId}</span></span>
          <button
            onClick={onLogout}
            className="px-6 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition duration-300 transform hover:scale-105 flex items-center"
          >
            <XCircle size={18} className="mr-2" /> Logout
          </button>
        </div>
      </header>

      {loading && (
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          <span className="ml-3 text-indigo-700">Processing...</span>
        </div>
      )}

      <section className="bg-white rounded-2xl shadow-xl p-8 mb-10 border border-blue-200">
        <h2 className="text-3xl font-bold text-indigo-700 mb-6 flex items-center">
          <PlusCircle size={28} className="mr-3 text-blue-500" /> {editingEventId ? 'Edit Event' : 'Create New Event'}
        </h2>
        <form onSubmit={handleCreateOrUpdateEvent} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={newEvent.name}
              onChange={handleNewEventChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition duration-150"
              placeholder="e.g., Tech Innovators Summit"
              required
            />
          </div>
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">Event Date</label>
            <input
              type="date"
              id="date"
              name="date"
              value={newEvent.date}
              onChange={handleNewEventChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition duration-150"
              required
            />
          </div>
          <div>
            <label htmlFor="time" className="block text-sm font-medium text-gray-700 mb-1">Event Time</label>
            <input
              type="time"
              id="time"
              name="time"
              value={newEvent.time}
              onChange={handleNewEventChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition duration-150"
              required
            />
          </div>
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input
              type="text"
              id="location"
              name="location"
              value={newEvent.location}
              onChange={handleNewEventChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition duration-150"
              placeholder="e.g., Virtual, Convention Center"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              id="description"
              name="description"
              value={newEvent.description}
              onChange={handleNewEventChange}
              rows="4"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition duration-150"
              placeholder="Brief description of your event..."
              required
            ></textarea>
          </div>

          <div className="md:col-span-2 mt-4">
            <h3 className="text-xl font-bold text-indigo-600 mb-4 flex items-center">
              <Ticket size={22} className="mr-2 text-purple-500" /> Ticket Types
            </h3>
            {newEvent.ticketTypes.map((ticket, index) => (
              <div key={ticket.id} className="flex flex-col md:flex-row gap-4 mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50 items-end">
                <div className="flex-1 w-full">
                  <label htmlFor={`ticketName-${index}`} className="block text-sm font-medium text-gray-700 mb-1">Ticket Name</label>
                  <input
                    type="text"
                    id={`ticketName-${index}`}
                    name="name"
                    value={ticket.name}
                    onChange={(e) => handleTicketTypeChange(index, e)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                    placeholder="e.g., Early Bird, VIP"
                    required
                  />
                </div>
                <div className="w-full md:w-1/4">
                  <label htmlFor={`ticketPrice-${index}`} className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                  <input
                    type="number"
                    id={`ticketPrice-${index}`}
                    name="price"
                    value={ticket.price}
                    onChange={(e) => handleTicketTypeChange(index, e)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                    required
                  />
                </div>
                <div className="w-full md:w-1/4">
                  <label htmlFor={`ticketCapacity-${index}`} className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                  <input
                    type="number"
                    id={`ticketCapacity-${index}`}
                    name="capacity"
                    value={ticket.capacity}
                    onChange={(e) => handleTicketTypeChange(index, e)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                    required
                  />
                </div>
                {newEvent.ticketTypes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTicketType(index)}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg shadow-sm hover:bg-red-600 transition duration-150 transform hover:scale-105 flex-shrink-0 w-full md:w-auto flex items-center justify-center"
                  >
                    <Trash2 size={16} className="mr-1" /> Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addTicketType}
              className="px-5 py-2 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition duration-300 transform hover:scale-105 flex items-center"
            >
              <PlusCircle size={18} className="mr-2" /> Add Ticket Type
            </button>
          </div>

          <div className="md:col-span-2 flex justify-end space-x-4 mt-6">
            {editingEventId && (
              <button
                type="button"
                onClick={() => {
                  setEditingEventId(null);
                  setNewEvent({ name: '', date: '', time: '', location: '', description: '', ticketTypes: [{ id: `tkt-${Date.now()}-0`, name: 'Standard', price: '', capacity: '' }] });
                }}
                className="px-8 py-3 bg-gray-500 text-white font-bold rounded-lg shadow-xl hover:bg-gray-600 transition duration-300 transform hover:scale-105 flex items-center"
              >
                <X size={20} className="mr-2" /> Cancel Edit
              </button>
            )}
            <button
              type="submit"
              className="px-8 py-3 bg-indigo-700 text-white font-bold rounded-lg shadow-xl hover:bg-indigo-800 transition duration-300 transform hover:scale-105 flex items-center"
            >
              <Save size={20} className="mr-2" /> {editingEventId ? 'Update Event' : 'Create Event'}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white rounded-2xl shadow-xl p-8 border border-blue-200">
        <h2 className="text-3xl font-bold text-indigo-700 mb-6 flex items-center">
          <Calendar size={28} className="mr-3 text-indigo-500" /> Your Events
        </h2>
        {events.length === 0 && !loading ? (
          <p className="text-gray-600 text-center py-4">No events created yet. Start by creating one above!</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map(event => (
              <EventCard
                key={event.id}
                event={event}
                onEdit={handleEditClick}
                onDelete={handleDeleteEvent}
                onToggleStatus={handleToggleEventStatus}
                showMessage={showMessage}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const EventCard = ({ event, onEdit, onDelete, onToggleStatus, showMessage }) => {
  const [showRegistrants, setShowRegistrants] = useState(false);
  const [registrants, setRegistrants] = useState([]);
  const [loadingRegistrants, setLoadingRegistrants] = useState(false);

  const fetchRegistrants = useCallback(async () => {
    setLoadingRegistrants(true);
    try {
      const data = await apiService.getRegistrationsForEvent(event.id);
      setRegistrants(data);
    } catch (error) {
      console.error(`Error fetching registrants for event ${event.id}:`, error);
      showMessage(`Failed to load registrants: ${error.message}`, 'error');
    } finally {
      setLoadingRegistrants(false);
    }
  }, [event.id, showMessage]);

  const handleViewRegistrantsClick = () => {
    setShowRegistrants(!showRegistrants);
    if (!showRegistrants) {
      fetchRegistrants();
    }
  };

  const totalCapacity = event.ticketTypes.reduce((sum, tt) => sum + Number(tt.capacity), 0);
  const totalSold = event.ticketTypes.reduce((sum, tt) => sum + Number(tt.sold), 0);
  const ticketsRemaining = totalCapacity - totalSold;

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-6 shadow-md hover:shadow-lg transition duration-200 transform hover:-translate-y-1 flex flex-col">
      <h3 className="text-xl font-bold text-indigo-800 mb-2 flex items-center">
        {event.name}
        {event.status === 'published' ? (
          <span className="ml-2 px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">Published</span>
        ) : (
          <span className="ml-2 px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700">Draft</span>
        )}
      </h3>
      <p className="text-gray-700 mb-1 flex items-center"><Calendar size={16} className="mr-2 text-gray-500" /> {event.date} at {event.time}</p>
      <p className="text-gray-700 mb-1 flex items-center"><MapPin size={16} className="mr-2 text-gray-500" /> {event.location}</p>
      <p className="text-gray-600 text-sm mt-2 flex-grow">{event.description.substring(0, 100)}{event.description.length > 100 ? '...' : ''}</p>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <h4 className="font-semibold text-indigo-600 mb-2 flex items-center"><Ticket size={18} className="mr-2 text-purple-500" /> Ticket Info:</h4>
        {event.ticketTypes.map((ticket, idx) => (
          <p key={idx} className="text-sm text-gray-700 ml-1">- {ticket.name}: ${Number(ticket.price).toFixed(2)} ({Number(ticket.sold)}/{Number(ticket.capacity)} sold)</p>
        ))}
        <p className="text-sm text-gray-800 font-bold mt-2">Total Tickets Sold: {totalSold} / {totalCapacity} ({ticketsRemaining} remaining)</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 justify-end">
        <button
          onClick={() => onEdit(event)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg shadow-md text-sm hover:bg-blue-600 transition duration-150 flex items-center"
        >
          <Edit size={16} className="mr-1" /> Edit
        </button>
        <button
          onClick={() => onToggleStatus(event)}
          className={`px-4 py-2 ${event.status === 'published' ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-500 hover:bg-green-600'} text-white rounded-lg shadow-md text-sm transition duration-150 flex items-center`}
        >
          {event.status === 'published' ? <XCircle size={16} className="mr-1" /> : <CheckCircle size={16} className="mr-1" />}
          {event.status === 'published' ? 'Unpublish' : 'Publish'}
        </button>
        <button
          onClick={() => handleViewRegistrantsClick()}
          className="px-4 py-2 bg-teal-500 text-white rounded-lg shadow-md text-sm hover:bg-teal-600 transition duration-150 flex items-center"
        >
          <Users size={16} className="mr-1" /> {showRegistrants ? 'Hide' : 'View'} Registrants
        </button>
        <button
          onClick={() => onDelete(event.id)}
          className="px-4 py-2 bg-red-500 text-white rounded-lg shadow-md text-sm hover:bg-red-600 transition duration-150 flex items-center"
        >
          <Trash2 size={16} className="mr-1" /> Delete
        </button>
      </div>

      {showRegistrants && (
        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h5 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            <Users size={20} className="mr-2 text-gray-600" /> Registrations for {event.name}
          </h5>
          {loadingRegistrants ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
              <span className="ml-2 text-gray-600">Loading registrants...</span>
            </div>
          ) : registrants.length === 0 ? (
            <p className="text-gray-600 text-sm">No one has registered for this event yet.</p>
          ) : (
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
              {registrants.map(reg => (
                <li key={reg.registrationId}>
                  <strong>{reg.attendeeName}</strong> ({reg.attendeeEmail}) - {reg.ticketTypeName}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};


const AttendeeDashboard = ({ onLogout, userId, showMessage }) => {
  const [events, setEvents] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [selectedEventForDetails, setSelectedEventForDetails] = useState(null);
  const [registrationDetails, setRegistrationDetails] = useState({ attendeeName: '', attendeeEmail: '', ticketTypeId: '' });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchAvailableEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.getEvents(); // No 'attendee' role param needed as lambda determines from JWT
      const processedData = data.map(event => ({
        ...event,
        ticketTypes: event.ticketTypes.map(tt => ({
          ...tt,
          price: Number(tt.price),
          capacity: Number(tt.capacity),
          sold: Number(tt.sold)
        }))
      }));
      setEvents(processedData);
    } catch (error) {
      console.error('Error fetching events:', error);
      showMessage(`Failed to load events: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  const fetchMyRegistrations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.getRegistrationsForUser();
      setMyRegistrations(data);
    } catch (error) {
      console.error('Error fetching my registrations:', error);
      showMessage(`Failed to load your registrations: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    if (userId) {
      fetchAvailableEvents();
      fetchMyRegistrations();
    }
  }, [userId, fetchAvailableEvents, fetchMyRegistrations]);

  const handleRegisterChange = (e) => {
    const { name, value } = e.target;
    setRegistrationDetails(prev => ({ ...prev, [name]: value }));
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEventForDetails) {
      showMessage('Please select an event first.', 'error');
      return;
    }
    if (!registrationDetails.ticketTypeId) {
      showMessage('Please select a ticket type.', 'error');
      return;
    }

    setLoading(true);
    try {
      const registrationData = {
        eventId: selectedEventForDetails.id,
        ...registrationDetails,
      };
      const result = await apiService.registerForEvent(registrationData);
      if (result.message) {
        showMessage('Registration successful! Please download your ticket.', 'success');
        if (result.ticketUrl) {
          window.open(result.ticketUrl, '_blank');
        } else {
          showMessage('Ticket generated, but no download link returned. Please check your registrations.', 'info');
        }
        setRegistrationDetails({ attendeeName: '', attendeeEmail: '', ticketTypeId: '' });
        setSelectedEventForDetails(null);
        fetchMyRegistrations();
        fetchAvailableEvents();
      } else {
        showMessage(`Failed to register: ${result.error || 'Unknown error.'}`, 'error');
      }
    } catch (error) {
      console.error('Error during registration:', error);
      showMessage(`An error occurred during registration: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = events.filter(event =>
    event.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.description.toLowerCase().includes(searchTerm.toLowerCase())
  );


  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-50 p-8">
      <header className="flex flex-col sm:flex-row justify-between items-center mb-8 pb-4 border-b-2 border-green-200">
        <h1 className="text-4xl font-extrabold text-teal-800 drop-shadow-sm mb-4 sm:mb-0">Attendee Portal</h1>
        <div className="flex items-center space-x-4">
          <span className="text-teal-700 text-lg">Your ID: <span className="font-mono bg-teal-200 px-2 py-1 rounded-md text-sm text-teal-800 select-all">{userId}</span></span>
          <button
            onClick={onLogout}
            className="px-6 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition duration-300 transform hover:scale-105 flex items-center"
          >
            <XCircle size={18} className="mr-2" /> Logout
          </button>
        </div>
      </header>

      {loading && (
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
          <span className="ml-3 text-teal-700">Processing...</span>
        </div>
      )}

      <section className="bg-white rounded-2xl shadow-xl p-8 mb-10 border border-green-200">
        <h2 className="text-3xl font-bold text-teal-700 mb-6 flex items-center">
          <BookOpen size={28} className="mr-3 text-green-500" /> Explore Events
        </h2>
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="Search events by name, location, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-5 py-3 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500 shadow-sm transition duration-150 text-gray-700"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          </div>
        </div>
        {filteredEvents.length === 0 && !loading ? (
          <p className="text-gray-600 text-center py-4">No events currently available or matching your search.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map(event => (
              <AttendeeEventCard
                key={event.id}
                event={event}
                onSelectEvent={setSelectedEventForDetails}
                isSelected={selectedEventForDetails?.id === event.id}
              />
            ))}
          </div>
        )}
      </section>

      {selectedEventForDetails && (
        <section className="bg-white rounded-2xl shadow-xl p-8 mb-10 border border-green-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-teal-700 flex items-center">
              <Info size={28} className="mr-3 text-blue-500" /> Event Details: {selectedEventForDetails.name}
            </h2>
            <button
              onClick={() => setSelectedEventForDetails(null)}
              className="px-4 py-2 bg-gray-400 text-white rounded-lg shadow-md hover:bg-gray-500 transition duration-150 flex items-center"
            >
              <X size={18} className="mr-2" /> Close
            </button>
          </div>

          <div className="space-y-4 text-gray-700 mb-6">
            <p className="flex items-center"><Calendar size={20} className="mr-3 text-gray-500" /> <strong>Date:</strong> {selectedEventForDetails.date}</p>
            <p className="flex items-center"><Clock size={20} className="mr-3 text-gray-500" /> <strong>Time:</strong> {selectedEventForDetails.time}</p>
            <p className="flex items-center"><MapPin size={20} className="mr-3 text-gray-500" /> <strong>Location:</strong> {selectedEventForDetails.location}</p>
            <p className="flex items-center"><Info size={20} className="mr-3 text-gray-500" /> <strong>Description:</strong> {selectedEventForDetails.description}</p>
          </div>

          <h3 className="text-xl font-bold text-teal-600 mb-4 flex items-center">
            <Ticket size={22} className="mr-2 text-purple-500" /> Register for Event
          </h3>
          <form onSubmit={handleRegisterSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="attendeeName" className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input
                type="text"
                id="attendeeName"
                name="attendeeName"
                value={registrationDetails.attendeeName}
                onChange={handleRegisterChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500 shadow-sm transition duration-150"
                required
              />
            </div>
            <div>
              <label htmlFor="attendeeEmail" className="block text-sm font-medium text-gray-700 mb-1">Your Email</label>
              <input
                type="email"
                id="attendeeEmail"
                name="attendeeEmail"
                value={registrationDetails.attendeeEmail}
                onChange={handleRegisterChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500 shadow-sm transition duration-150"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="ticketTypeId" className="block text-sm font-medium text-gray-700 mb-1">Select Ticket Type</label>
              <select
                id="ticketTypeId"
                name="ticketTypeId"
                value={registrationDetails.ticketTypeId}
                onChange={handleRegisterChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500 shadow-sm transition duration-150 bg-white"
                required
              >
                <option value="">-- Select a ticket type --</option>
                {selectedEventForDetails.ticketTypes.map(ticket => (
                  <option key={ticket.id} value={ticket.id} disabled={Number(ticket.sold) >= Number(ticket.capacity)}>
                    {ticket.name} - ${Number(ticket.price).toFixed(2)}
                    {Number(ticket.sold) >= Number(ticket.capacity) ? ' (Sold Out)' : ` (${Number(ticket.capacity) - Number(ticket.sold)} left)`}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 p-4 bg-teal-50 rounded-lg border border-teal-200">
              <h3 className="text-xl font-bold text-teal-700 mb-4 flex items-center">
                <Globe size={22} className="mr-2 text-teal-600" /> Payment Details (Mock)
              </h3>
              <p className="text-teal-800 text-sm">
                In a real application, a Stripe integration would go here to collect payment information securely.
                For this demo, clicking "Register & Pay" will simulate a successful payment and ticket issuance.
              </p>
            </div>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                className="px-8 py-3 bg-gradient-to-r from-teal-600 to-teal-700 text-white font-bold rounded-lg shadow-xl hover:shadow-2xl transition duration-300 transform hover:scale-105 flex items-center"
              >
                <CheckCircle size={20} className="mr-2" /> Register & Pay
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="bg-white rounded-2xl shadow-xl p-8 border border-green-200">
        <h2 className="text-3xl font-bold text-teal-700 mb-6 flex items-center">
          <BookOpen size={28} className="mr-3 text-green-500" /> My Registrations
        </h2>
        {myRegistrations.length === 0 && !loading ? (
          <p className="text-gray-600 text-center py-4">You haven't registered for any events yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myRegistrations.map(reg => (
              <div key={reg.registrationId} className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-md">
                <h3 className="text-xl font-bold text-indigo-800 mb-2">{events.find(e => e.id === reg.eventId)?.name || 'Unknown Event'}</h3>
                <p className="text-gray-700 mb-1"><strong>Ticket:</strong> {reg.ticketTypeName}</p>
                <p className="text-gray-700 mb-1"><strong>Registered On:</strong> {reg.registrationDate ? new Date(reg.registrationDate).toLocaleDateString() : 'N/A'}</p>
                <p className="text-gray-700 mb-4"><strong>Status:</strong> <span className="font-semibold text-green-600">{reg.status}</span></p>
                {reg.ticketUrl && (
                  <a
                    href={reg.ticketUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition duration-300 transform hover:scale-105 text-sm"
                  >
                    <Ticket size={16} className="mr-2" /> Download Ticket
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const AttendeeEventCard = ({ event, onSelectEvent, isSelected }) => {
  const availableTickets = event.ticketTypes.reduce((sum, tt) => sum + (Number(tt.capacity) - Number(tt.sold)), 0);
  const isSoldOut = availableTickets <= 0;

  return (
    <div
      className={`bg-white border ${isSelected ? 'border-teal-600 ring-2 ring-teal-500' : 'border-teal-200'} rounded-xl p-6 shadow-lg hover:shadow-xl transition duration-200 transform ${!isSoldOut ? 'hover:-translate-y-1 cursor-pointer' : ''} ${isSoldOut ? 'opacity-70 grayscale' : ''}`}
      onClick={() => !isSoldOut && onSelectEvent(event)}
    >
      <h3 className="text-xl font-bold text-teal-800 mb-2 flex items-center">
        {event.name}
        {isSoldOut && <span className="ml-2 px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">Sold Out</span>}
      </h3>
      <p className="text-gray-700 mb-1 flex items-center"><Calendar size={16} className="mr-2 text-gray-500" /> {event.date} at {event.time}</p>
      <p className="text-gray-700 mb-1 flex items-center"><MapPin size={16} className="mr-2 text-gray-500" /> {event.location}</p>
      <p className="text-gray-600 text-sm mt-2 flex-grow">{event.description.substring(0, 100)}{event.description.length > 100 ? '...' : ''}</p>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <h4 className="font-semibold text-teal-600 mb-2 flex items-center"><Ticket size={18} className="mr-2 text-purple-500" /> Ticket Options:</h4>
        {event.ticketTypes.map((ticket, idx) => (
          <p key={idx} className="text-sm text-gray-700 ml-1">
            - {ticket.name}: ${Number(ticket.price).toFixed(2)}
            <span className="ml-1 text-xs font-semibold">({Number(ticket.capacity) - Number(ticket.sold)}/{Number(ticket.capacity)} available)</span>
          </p>
        ))}
      </div>

      <div className="mt-6 text-center">
        {!isSoldOut ? (
          <button
            onClick={() => onSelectEvent(event)}
            className={`px-6 py-2 bg-gradient-to-r ${isSelected ? 'from-teal-700 to-teal-800' : 'from-blue-600 to-blue-700'} text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition duration-300 transform hover:scale-105 flex items-center justify-center w-full`}
          >
            <Eye size={18} className="mr-2" /> {isSelected ? 'View Details (Selected)' : 'View Details & Register'}
          </button>
        ) : (
          <span className="px-6 py-2 bg-gray-300 text-gray-700 font-semibold rounded-lg shadow-md w-full flex items-center justify-center">
            <XCircle size={18} className="mr-2" /> Fully Booked
          </span>
        )}
      </div>
    </div>
  );
};


export default App;
