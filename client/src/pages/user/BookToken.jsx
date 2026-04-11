import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Ticket, Users, Zap, ArrowLeft, AlertCircle } from 'lucide-react';

const BookToken = () => {
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const res = await api.get('/services');
        setServices(res.data.data.services);
      } catch (err) {
        toast.error('Failed to load services.');
      } finally {
        setLoading(false);
      }
    };
    fetchServices();
  }, []);

  const handleBook = async () => {
    if (!selectedService) {
      toast.error('Please select a service first.');
      return;
    }

    setBooking(true);
    try {
      const res = await api.post('/tokens/book', {
        serviceId: selectedService._id,
      });
      toast.success(res.data.message);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to book token.');
    } finally {
      setBooking(false);
    }
  };

  return (
    <div className="animate-in" id="book-token-page">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(-1)}
            id="back-btn"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1>Book a Token</h1>
            <p>Select a service to join the queue</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center" style={{ padding: 60 }}>
          <div className="spinner"></div>
        </div>
      ) : services.length === 0 ? (
        <div className="empty-state">
          <AlertCircle size={64} />
          <h3>No Services Available</h3>
          <p>There are no active services at the moment. Please check back later.</p>
        </div>
      ) : (
        <>
          <div className="service-grid mb-6">
            {services.map((service) => (
              <div
                key={service._id}
                className={`service-card ${
                  selectedService?._id === service._id ? 'selected' : ''
                }`}
                onClick={() => setSelectedService(service)}
                id={`service-${service.prefix}`}
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="service-card-name">{service.name}</div>
                  <span
                    className="badge badge-primary"
                    style={{ fontSize: '0.85rem', fontWeight: 800 }}
                  >
                    {service.prefix}
                  </span>
                </div>
                <div className="service-card-desc">{service.description}</div>
                <div className="service-card-meta">
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {service.capacityPerHour}/hr
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap size={12} /> Active
                  </span>
                </div>
              </div>
            ))}
          </div>

          {selectedService && (
            <div
              className="card animate-in"
              style={{
                maxWidth: 500,
                border: '1px solid var(--primary)',
                boxShadow: 'var(--shadow-glow)',
              }}
            >
              <h3 className="card-title mb-2">Confirm Booking</h3>
              <p className="text-sm text-muted mb-4">
                You're about to join the queue for <strong>{selectedService.name}</strong>.
                Your token prefix will be <strong>{selectedService.prefix}</strong>.
              </p>
              <div className="flex gap-3">
                <button
                  className="btn btn-primary btn-lg"
                  onClick={handleBook}
                  disabled={booking}
                  id="confirm-book-btn"
                >
                  {booking ? (
                    <>
                      <div
                        className="spinner"
                        style={{ width: 18, height: 18, borderWidth: 2 }}
                      ></div>
                      Booking...
                    </>
                  ) : (
                    <>
                      <Ticket size={18} />
                      Book Token
                    </>
                  )}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setSelectedService(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BookToken;
