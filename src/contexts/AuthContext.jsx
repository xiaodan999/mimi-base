import { createContext, useContext, useEffect, useState } from "react";
import supabase from "../supabase-client/supabase";

/**
 * @typedef {Object} UserContextValue
 * @property {({id:string; user_name:string}) | null} user - The user object.
 * @property {boolean} loading - The loading state.
 */

/** @type {UserContextValue} */
const initialValue = { user: null, loading: true };

const AuthContext = createContext(initialValue);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data, error } = await supabase.from("users").select("id,user_name").single();
      if (error || !data) {
        setUser(null);
      } else {
        setUser(data);
      }
      setLoading(false);
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log({ event });
      switch (event) {
        case "SIGNED_IN": {
          setLoading(true);
          const { data, error } = await supabase.from("users").select("id,user_name").single();
          if (error || !data) {
            setUser(null);
          } else {
            setUser(data);
          }
          setLoading(false);
          break;
        }
        case "SIGNED_OUT": {
          setUser(null);
          break;
        }
        default: {
        }
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
};

/**
 * A hook that returns the currently logged in user.
 *
 * @returns {[UserContextValue["user"], boolean]}
 */
export const useUser = () => {
  const { user, loading } = useContext(AuthContext);
  return [user, loading];
};
