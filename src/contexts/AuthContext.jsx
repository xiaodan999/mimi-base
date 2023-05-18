import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

import supabase from "../supabase-client/supabase";

/**
 * @typedef {Object} UserContextValue
 * @property {({id:string; user_name:string; tou_xiang:string; circle:string;}) | null} user - The user object.
 * @property {boolean} loading - The loading state.
 */

/** @type {UserContextValue} */
const initialValue = { user: null, loading: true };

const AuthContext = createContext(initialValue);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const handleAuthStateChangeRef = useRef(() => {});

  const fetchUserData = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session === null) {
      setUser(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("users")
      .select("id,user_name,tou_xiang,tou-xiang-circle(url)")
      .eq("id", session.user.id)
      .single();
    if (error || !data) {
      setUser(null);
    } else {
      setUser({ ...data, circle: data["tou-xiang-circle"].url });
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    handleAuthStateChangeRef.current = async (event, session) => {
      console.log({ event, session });
      switch (event) {
        case "INITIAL_SESSION": {
          setLoading(true);
          await fetchUserData();
          break;
        }
        case "SIGNED_IN": {
          if (!user) {
            setLoading(true);
            await fetchUserData();
          }
          break;
        }
        case "SIGNED_OUT": {
          setUser(null);
          break;
        }
        default: {
        }
      }
    };
  }, [user, fetchUserData]);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((...args) => {
      handleAuthStateChangeRef.current(...args);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchUserData]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh: fetchUserData }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * A hook that returns the currently logged in user.
 *
 * @returns {[UserContextValue["user"], boolean,() => Promise<void>]}
 */
export const useUser = () => {
  const { user, loading, refresh } = useContext(AuthContext);
  return [user, loading, refresh];
};
